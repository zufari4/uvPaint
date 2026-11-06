import type {
  Layer,
  ModelAsset,
  Point,
  SelectionMode,
  TextureDocument,
  Tool,
  TransformSession,
  UVDisplayMode,
  Island,
} from "../types";
import { canvas, context, cloneCanvas, masked, alphaBounds } from "./canvas";
import { History, snapshot } from "./history";
import { composite } from "../render/composite";
import { WarpRenderer } from "../render/warp";
import { editingMask, extractIslands, islandMask, hitIsland } from "../tools/uv";
import {
  combineSelection,
  invertSelection,
  floodMask,
} from "../tools/selection";
import { loadGLB, disposeModel } from "../import/model";
import { prepareReload } from "../import/reload-model";
import { demoModel } from "../import/demo";
import { decodeImage, pickFile } from "../import/files";
import { exportPNG } from "../export/png";
import { syncMaterial } from "../render/material";
import { transferAlpha } from "../tools/alpha-transfer";
import { loadPreferences, preferenceKey } from "./preferences";
import { defaultStudioLighting, normalizeStudioLighting, type StudioLighting } from "./studio-lighting";
import { faceKey } from "../tools/uv-guides";
import { sourceGeometry } from "../render/mesh-source";
import { encodeProject, decodeProject } from "./project";

export class Editor {
  docs = new Map<string, TextureDocument>();
  textureDocuments = new Map<string, TextureDocument>();
  histories = new Map<string, History>();
  activeId = "";
  projectName = "";
  private projectHandle: string | undefined;
  model: ModelAsset | null = null;
  tool: Tool = "move";
  selectionMode: SelectionMode = "replace";
  color = "#f06b4f";
  backgroundColor = "#ffffff";
  brushSize = 32;
  brushOpacity = 1;
  tolerance = 24;
  contiguous = true;
  uvDisplay: UVDisplayMode = "outline";
  hiddenFaces = new Set<string>();
  private textureFocusEnabled = true;
  private textureHiddenCache: { hidden: Set<string>; faces: Island["faces"]; model: ModelAsset | null; result: Set<string> } | null = null;
  islandMenu: {x:number; y:number} | null = null;
  pickingLayerIsland = false;
  imageImport: { id: string; image: HTMLCanvasElement; name: string } | null = null;
  private finishImageImport: (() => void) | null = null;
  private visibleCache: {islands:Island[]; hidden:Set<string>; result:Island[]} | null = null;
  private selectedCache: {islands:Island[]; ids:string; result:Set<string>} | null = null;
  uvColor = "#a5ece0";
  uvOpacity = 0.65;
  textScale = 1.4;
  readonly previewMode = "studio" as const;
  previewEdges = true;
  studioLighting = { ...defaultStudioLighting };
  transform: TransformSession | null = null;
  private transformFrame = 0;
  private pendingTransform: { session: TransformSession; points: Point[] } | null = null;
  private dragPreview: HTMLCanvasElement | null = null;
  private reducedPreview = false;
  private filterBase: TextureDocument | null = null;
  cloneSource: Point | null = null;
  message = "Open a GLB to start, or create a texture.";
  notice: { id: number; text: string } | null = null;
  error = "";
  busy = false;
  modelLoading: { name: string; stage: string; detail?: string } | null = null;
  private modelProgressTime = 0;
  revision = 0;
  pixelsRevision = 0;
  clipboard: HTMLCanvasElement | null = null;
  output: HTMLCanvasElement | null = null;
  private listeners = new Set<() => void>();
  private warpInstance: WarpRenderer | null = null;
  constructor() {
    const preferences = loadPreferences();
    this.uvColor = preferences.uvColor;
    this.uvOpacity = preferences.uvOpacity;
    this.textScale = preferences.textScale;
    this.uvDisplay = preferences.uvDisplay;
    this.studioLighting = preferences.studioLighting;
  }
  setUVDisplay(mode: UVDisplayMode) { this.uvDisplay = mode; this.savePreferences(); }
  get textureIsolated() { return this.textureFocusEnabled && !!this.layer?.uvBinding?.island.faces?.length; }
  get textureHiddenFaces(): Set<string> {
    const faces = this.textureFocusEnabled ? this.layer?.uvBinding?.island.faces : undefined;
    if (!faces?.length) return this.hiddenFaces;
    const cached = this.textureHiddenCache;
    if (cached?.hidden === this.hiddenFaces && cached.faces === faces && cached.model === this.model) return cached.result;
    const result = this.facesOutside(new Set(faces.map(faceKey)));
    this.hiddenFaces.forEach(key => result.add(key));
    this.textureHiddenCache = { hidden: this.hiddenFaces, faces, model: this.model, result };
    return result;
  }
  get visibleIslands(): Island[] {
    const islands = this.doc?.islands;
    if (!islands) return [];
    const hidden = this.textureHiddenFaces;
    if (this.visibleCache?.islands === islands && this.visibleCache.hidden === hidden) return this.visibleCache.result;
    const result = islands.map(island => {
      if (!island.faces) return island;
      const indices = island.faces.map((f,i)=>hidden.has(faceKey(f)) ? -1 : i).filter(i=>i>=0);
      if (indices.length === island.triangles.length) return island;
      return {...island, triangles: indices.map(i=>island.triangles[i]), faces: indices.map(i=>island.faces![i])};
    }).filter(i=>i.triangles.length);
    this.visibleCache={islands,hidden,result};
    return result;
  }
  get selectedFaces() {
    const islands=this.doc?.islands ?? [], ids=this.doc?.selectedIslands.join(",") ?? "";
    if(this.selectedCache?.islands===islands && this.selectedCache.ids===ids)return this.selectedCache.result;
    const result=new Set(islands.filter(i=>this.doc!.selectedIslands.includes(i.id)).flatMap(i=>i.faces?.map(faceKey) ?? []));
    this.selectedCache={islands,ids,result};return result;
  }
  openIslandMenu(x:number,y:number,id=-1) {
    if (id>=0 && !this.doc?.selectedIslands.includes(id)) this.selectIsland(id);
    this.islandMenu={x,y}; this.emit();
  }
  setIslandVisibility(action: "isolate" | "all" | "except") {
    const selected = this.selectedFaces;
    if (action !== "all" && !selected.size) return;
    const hidden = new Set<string>();
    if (action === "except") selected.forEach(key=>hidden.add(key));
    if (action === "isolate") this.facesOutside(selected).forEach(key => hidden.add(key));
    this.textureFocusEnabled=false;
    this.hiddenFaces=hidden; this.islandMenu=null; this.emit();
  }
  private facesOutside(selected: Set<string>) {
    const hidden = new Set<string>();
    for (const part of this.model?.parts ?? []) {
      const g=sourceGeometry(part), count=(g.index?.count ?? g.getAttribute("position").count)/3;
      for(let i=0;i<count;i++) {const key=faceKey({meshId:part.uuid,triangle:i});if(!selected.has(key))hidden.add(key);}
    }
    return hidden;
  }
  setUVAppearance(patch: { uvColor?: string; uvOpacity?: number }) {
    if (patch.uvColor !== undefined && /^#[0-9a-f]{6}$/i.test(patch.uvColor))
      this.uvColor = patch.uvColor;
    if (patch.uvOpacity !== undefined && Number.isFinite(patch.uvOpacity))
      this.uvOpacity = Math.max(0, Math.min(1, patch.uvOpacity));
    this.savePreferences();
  }
  setTextScale(value: number) {
    if (!Number.isFinite(value)) return;
    this.textScale = Math.max(0.8, Math.min(2.2, value));
    this.savePreferences();
  }
  setStudioLighting(patch: Partial<StudioLighting>) {
    this.studioLighting = normalizeStudioLighting(patch, this.studioLighting);
    this.savePreferences();
  }
  private savePreferences() {
    try {
      localStorage.setItem(
        preferenceKey,
        JSON.stringify({
          uvColor: this.uvColor,
          uvOpacity: this.uvOpacity,
          textScale: this.textScale,
          uvDisplay: this.uvDisplay,
          studioLighting: this.studioLighting,
        }),
      );
    } catch {
      this.fail(
        "Settings apply to this session, but could not be saved for the next launch.",
      );
    }
    this.emit();
  }
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getSnapshot = () => this.revision;
  get doc() {
    return this.docs.get(this.activeId) ?? null;
  }
  get layer() {
    return this.doc?.layers.find((l) => l.id === this.doc!.activeId) ?? null;
  }
  get history() {
    const key = this.documentKey(this.doc);
    if (!this.histories.has(key)) this.histories.set(key, new History());
    return this.histories.get(key)!;
  }
  private documentKey(doc: TextureDocument | null) {
    return doc?.textureUsage && doc.textureUsage !== "Base Color"
      ? `${doc.id}:${doc.sourceIndex}`
      : (doc?.id ?? this.activeId);
  }
  get warp() {
    return this.warpInstance ?? (this.warpInstance = new WarpRenderer());
  }
  emit(pixels = false, interactive = false) {
    if (pixels && this.doc) {
      this.pixelsRevision++;
      this.output = composite(this.doc, this.output ?? undefined);
      const slot = this.model?.slots.find((s) => s.id === this.activeId);
      if (slot) {
        let preview = this.output;
        const scale = Math.min(1, 512 / Math.max(preview.width, preview.height));
        this.reducedPreview = interactive && scale < 1;
        if (this.reducedPreview) {
          const width = Math.max(1, Math.round(preview.width * scale));
          const height = Math.max(1, Math.round(preview.height * scale));
          if (!this.dragPreview || this.dragPreview.width !== width || this.dragPreview.height !== height)
            this.dragPreview = canvas(width, height, false);
          const ctx = context(this.dragPreview);
          ctx.clearRect(0, 0, width, height);
          ctx.drawImage(preview, 0, 0, width, height);
          preview = this.dragPreview;
        }
        syncMaterial(slot, this.doc, preview);
      }
    }
    this.revision++;
    this.listeners.forEach((fn) => fn());
  }
  notify(message: string) {
    this.message = message;
    this.notice = { id: (this.notice?.id ?? 0) + 1, text: message };
    this.emit();
  }
  fail(error: unknown) {
    this.error = error instanceof Error ? error.message : String(error);
    this.emit();
  }
  async run(fn: () => Promise<void>) {
    if (this.busy) return;
    this.busy = true;
    this.error = "";
    this.emit();
    try {
      await fn();
    } catch (e) {
      this.fail(e);
    } finally {
      this.busy = false;
      this.emit();
    }
  }
  async checkSize(w: number, h: number) {
    if (!Number.isSafeInteger(w) || !Number.isSafeInteger(h) || w < 1 || h < 1)
      throw new Error("Enter positive whole-number dimensions.");
    this.warp.check(w, h);
    const available = await window.desktop?.memory();
    const estimate = w * h * 4 * 6;
    if (available && estimate > available * 0.8)
      throw new Error(
        `${w} × ${h} needs about ${Math.ceil(estimate / 1048576)} MiB of working memory; only ${Math.floor(available / 1048576)} MiB is currently free. Free memory or choose smaller dimensions. No downscaling was applied.`,
      );
    const probe = canvas(w, h);
    probe.width = probe.height = 1;
  }
  async openModel() {
    try {
      const file = await pickFile("model", name => {
        this.modelLoading = { name, stage: "Reading file" };this.emit();
      });
      if (file) await this.importModel(file.bytes, file.name, file.sourcePath);
    } finally { this.modelLoading = null;this.emit(); }
  }
  async openProject() {
    const file = await pickFile("project");
    if (file) await this.importProject(file.bytes, file.name, file.handle);
  }
  async openRecentProject(id: string) {
    if (!window.desktop) return;
    const file = await window.desktop.openRecentProject(id);
    await this.importProject(file.bytes, file.name, file.handle);
  }
  async projectBytes() {
    if (!this.doc) throw new Error("Create a texture or open a model first.");
    this.confirmTransform();
    const stored = new Map(this.textureDocuments);
    for (const doc of this.docs.values()) stored.set(this.documentKey(doc), doc);
    const documents = this.model
      ? this.model.slots.flatMap(slot => slot.documents.map(template => stored.get(this.documentKey(template)) ?? template))
      : [...this.docs.values()];
    return encodeProject({ model: this.model, documents,
      openDocuments: [...this.docs.values()].map(doc => documents.indexOf(doc)), activeDocument: documents.indexOf(this.doc),
      hiddenFaces: this.hiddenFaces, previewMode: this.previewMode, previewEdges: this.previewEdges,
      paint: { tool: this.tool, color: this.color, backgroundColor: this.backgroundColor, brushSize: this.brushSize,
        brushOpacity: this.brushOpacity, tolerance: this.tolerance, contiguous: this.contiguous } });
  }
  async saveProject(saveAs = false) {
    if (!this.doc) return;
    const bytes = await this.projectBytes();
    const name = this.projectName || `${(this.model?.name ?? this.doc.name).replace(/\.[^.]+$/, "")}.uvpaint`;
    if (window.desktop) {
      const saved = await window.desktop.saveProject(bytes, name, saveAs ? undefined : this.projectHandle);
      if (!saved) return;
      this.projectName = saved.name;this.projectHandle = saved.handle;
    } else {
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/octet-stream" }));
      const link = document.createElement("a");link.href = url;link.download = name;link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);this.projectName = name;
    }
    this.notify(`Project saved: ${this.projectName}`);
  }
  async importProject(bytes: Uint8Array, name: string, handle?: string) {
    // Decode and validate everything before replacing the current workspace.
    const state = await decodeProject(bytes, (w, h) => this.checkSize(w, h));
    this.cancelTransform();
    if (this.model) disposeModel(this.model);
    this.model = state.model;
    this.docs.clear();this.textureDocuments.clear();this.histories.clear();
    for (const doc of state.documents) this.textureDocuments.set(this.documentKey(doc), doc);
    for (const index of state.openDocuments) {
      const doc = state.documents[index];this.docs.set(doc.id, doc);
      const slot = this.model?.slots.find(s => s.id === doc.id);
      if (slot) syncMaterial(slot, doc, composite(doc));
    }
    this.activeId = state.documents[state.activeDocument].id;
    this.hiddenFaces = state.hiddenFaces;this.previewEdges = state.previewEdges;
    this.textureFocusEnabled = true;
    this.tool = state.paint.tool;this.color = state.paint.color;this.backgroundColor = state.paint.backgroundColor;
    this.brushSize = state.paint.brushSize;this.brushOpacity = state.paint.brushOpacity;this.tolerance = state.paint.tolerance;this.contiguous = state.paint.contiguous;
    this.islandMenu = null;this.pickingLayerIsland = false;this.cloneSource = null;this.output = null;
    this.projectName = name;this.projectHandle = handle;
    this.emit(true);this.notify(`Project opened: ${name}`);
    if (handle && window.desktop) await window.desktop.rememberProject(handle);
  }
  async importModel(bytes: Uint8Array, name: string, sourcePath?: string) {
    try {
      const progress = (stage: string, detail?: string) => this.reportModelLoading(name, stage, detail);
      const result = await loadGLB(new Uint8Array(bytes).buffer, name,
        (w, h) => this.checkSize(w, h), progress);
      if (result.model.source?.kind === "glb") result.model.source.path = sourcePath;
      await progress("Preparing 3D preview");
      this.install(result);
      await this.yieldModelLoading();
    } finally { this.modelLoading = null;this.emit(); }
  }
  async reloadModel() {
    const previous = this.model;
    if (previous?.source?.kind !== "glb") throw new Error("Open a GLB model before reloading it.");
    if (!window.desktop) throw new Error("Reload GLB requires the desktop application.");
    let replacement: ModelAsset | null = null;
    try {
      let file;
      if (previous.source.path) {
        await this.reportModelLoading(previous.name, "Reading original GLB");
        file = await window.desktop.reloadModel(previous.source.path);
      } else {
        // Older projects contain embedded GLB bytes but no source path. Locate
        // the file once, without replacing the current document or its layers.
        file = await pickFile("model");
        if (!file) return;
      }
      const result = await loadGLB(new Uint8Array(file.bytes).buffer, file.name,
        (w, h) => this.checkSize(w, h), (stage, detail) => this.reportModelLoading(file.name, stage, detail));
      replacement = result.model;
      if (replacement.source?.kind === "glb") replacement.source.path = file.sourcePath;
      await this.reportModelLoading(file.name, "Preserving layers and UV bindings");
      const { migrate } = prepareReload(previous, replacement);
      const stored = new Map<string, TextureDocument>();
      for (const slot of previous.slots) for (const doc of slot.documents) stored.set(this.documentKey(doc), doc);
      for (const doc of this.textureDocuments.values()) stored.set(this.documentKey(doc), doc);
      for (const doc of this.docs.values()) stored.set(this.documentKey(doc), doc);
      const migrated = new Map<string, TextureDocument>(), keys = new Map<string, string>();
      for (const [key, doc] of stored) {
        const updated = migrate(doc), nextKey = this.documentKey(updated);
        migrated.set(nextKey, updated);keys.set(key, nextKey);
      }
      const docs = new Map([...this.docs].map(([id, doc]) => [id, migrate(doc)]));
      const history = new Map<string, History>();
      for (const [key, old] of this.histories) {
        const updated = new History();
        updated.undoStack = old.undoStack.map(entry => ({ ...entry, doc: migrate(entry.doc) }));
        updated.redoStack = old.redoStack.map(entry => ({ ...entry, doc: migrate(entry.doc) }));
        history.set(keys.get(key) ?? key, updated);
      }
      for (const slot of replacement.slots) {
        slot.documents = slot.documents.map(doc => migrated.get(this.documentKey(doc)) ?? doc);
        if (!docs.has(slot.id)) docs.set(slot.id, slot.documents[0]);
        for (const doc of slot.documents) migrated.set(this.documentKey(doc), doc);
        const current = docs.get(slot.id)!;
        syncMaterial(slot, current, composite(current));
      }
      const transform = this.transform ? { ...this.transform, before: migrate(this.transform.before) } : null;
      if (transform) {
        const layer = docs.get(this.activeId)?.layers.find(layer => layer.id === transform.layerId);
        transform.clip = layer?.uvMask ?? transform.clip;
        transform.outside = layer?.uvMask ? masked(layer.canvas, layer.uvMask, true) : undefined;
      }
      await this.reportModelLoading(file.name, "Preparing 3D preview");
      this.model = replacement;this.docs = docs;this.textureDocuments = migrated;this.histories = history;this.transform = transform;
      replacement = null;
      this.output = null;this.emit(true);
      disposeModel(previous);
      await this.yieldModelLoading();
    } finally {
      if (replacement) disposeModel(replacement);
      this.modelLoading = null;this.emit();
    }
  }
  async importModelFile(file: File) {
    try {
      await this.reportModelLoading(file.name, "Reading file");
      await this.importModel(new Uint8Array(await file.arrayBuffer()), file.name, window.desktop?.modelFilePath(file) || undefined);
    } finally { this.modelLoading = null;this.emit(); }
  }
  private async reportModelLoading(name: string, stage: string, detail?: string) {
    const now = performance.now();
    if (this.modelLoading?.name === name && this.modelLoading.stage === stage && now - this.modelProgressTime < 50) return;
    this.modelProgressTime = now;
    this.modelLoading = { name, stage, detail };this.emit();
    await this.yieldModelLoading();
  }
  private yieldModelLoading() {
    return new Promise<void>(resolve => {
      // Paint the stage before expensive work. The fallback also allows loading
      // to finish when the window is minimized and animation frames pause.
      let frame = 0;
      const timer = setTimeout(() => { cancelAnimationFrame(frame);resolve(); }, 100);
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => { clearTimeout(timer);resolve(); });
      });
    });
  }
  async sample() {
    this.install(await demoModel((w, h) => this.checkSize(w, h)));
  }
  install({ model, docs }: { model: ModelAsset; docs: TextureDocument[] }) {
    this.projectName = "";this.projectHandle = undefined;
    if (this.model) disposeModel(this.model);
    this.model = model;
    this.hiddenFaces = new Set();
    this.textureFocusEnabled = true;
    this.islandMenu = null;
    this.pickingLayerIsland = false;
    this.docs.clear();
    this.textureDocuments.clear();
    this.histories.clear();
    for (const d of docs) this.docs.set(d.id, d);
    for (const slot of model.slots)
      for (const doc of slot.documents)
        this.textureDocuments.set(this.documentKey(doc), doc);
    this.activeId = docs[0].id;
    this.transform = null;
    this.cloneSource = null;
    this.output = null;
    this.emit(true);
    this.message = `${model.name} · ${model.slots.length} materials`;
    this.emit();
  }
  async newCanvas(w: number, h: number) {
    await this.checkSize(w, h);
    if (this.doc) {
      this.change("Resize texture", (d) => {
        d.width = w;
        d.height = h;
        d.selection = null;
        d.layers = d.layers.map((l) => {
          const c = canvas(w, h);
          context(c).drawImage(l.canvas, 0, 0, w, h);
          const uvMask = l.uvMask ? canvas(w, h) : null;
          if (uvMask) context(uvMask).drawImage(l.uvMask!, 0, 0, w, h);
          return { ...l, canvas: c, uvMask, placement: undefined };
        });
      });
    } else {
      const id = crypto.randomUUID(),
        l = this.makeLayer(canvas(w, h), "Layer 1");
      this.docs.set(id, {
        id,
        name: "Untitled",
        width: w,
        height: h,
        layers: [l],
        activeId: l.id,
        selection: null,
        uvSet: "uv",
        islands: [],
        selectedIslands: [],
        restrict: false,
      });
      this.activeId = id;
      this.emit(true);
    }
  }
  selectMaterial(id: string) {
    this.textureFocusEnabled = true;
    this.pickingLayerIsland = false;
    this.confirmTransform();
    this.activeId = id;
    this.output = null;
    this.cloneSource = null;
    this.emit(true);
  }
  selectTexture(sourceIndex: number) {
    this.textureFocusEnabled = true;
    this.pickingLayerIsland = false;
    const slot = this.model?.slots.find((s) => s.id === this.activeId);
    if (!slot || !this.doc) return;
    const template = slot.documents.find(
      (d) => (d.sourceIndex ?? -1) === sourceIndex,
    );
    if (!template) return;
    const targetKey = this.documentKey(template);
    if (targetKey === this.documentKey(this.doc)) return;
    this.confirmTransform();
    this.textureDocuments.set(this.documentKey(this.doc), this.doc);
    this.docs.set(
      this.activeId,
      this.textureDocuments.get(targetKey) ?? template,
    );
    this.output = null;
    this.cloneSource = null;
    this.emit(true);
  }
  change(label: string, fn: (d: TextureDocument) => void) {
    if (!this.doc) return;
    this.pickingLayerIsland = false;
    this.confirmTransform();
    const before = snapshot(this.doc);
    const next = snapshot(this.doc);
    fn(next);
    this.history.push(label, before);
    this.docs.set(this.activeId, next);
    this.emit(true);
  }
  beginFilter() {
    this.cancelFilter();
    this.pickingLayerIsland = false;
    this.islandMenu = null;
    this.confirmTransform();
    if (!this.doc?.layers.length) return null;
    this.filterBase = this.doc;
    return this.doc;
  }
  previewFilter(pixels: Map<HTMLCanvasElement, HTMLCanvasElement> | null) {
    const base = this.filterBase;
    if (!base) return;
    let next = base;
    if (pixels) {
      next = snapshot(base);
      for (const layer of next.layers) {
        const replaced = pixels.get(layer.canvas);
        if (!replaced) continue;
        layer.canvas = replaced;
        layer.placement = undefined;
      }
    }
    this.docs.set(this.activeId, next);
    this.emit(true);
  }
  applyFilter(label: string) {
    const base = this.filterBase;
    if (!base) return;
    this.filterBase = null;
    if (this.doc !== base) this.history.push(label, base);
    this.emit();
  }
  cancelFilter() {
    const base = this.filterBase;
    if (!base) return;
    this.filterBase = null;
    this.docs.set(this.activeId, base);
    this.emit(true);
  }
  makeLayer(c: HTMLCanvasElement, name: string): Layer {
    return {
      id: crypto.randomUUID(),
      name,
      canvas: c,
      visible: true,
      opacity: 1,
      blend: "source-over",
    };
  }
  addEmpty() {
    if (this.doc)
      this.change("New layer", (d) => {
        const l = this.makeLayer(
          canvas(d.width, d.height),
          `Layer ${d.layers.length + 1}`,
        );
        d.layers.push(l);
        d.activeId = l.id;
      });
  }
  async openImage() {
    const file = await pickFile("image");
    if (file) await this.requestImageImport(file.bytes, file.name);
  }
  async requestImageImport(bytes: Uint8Array, name: string) {
    if (this.imageImport) return;
    const image = await decodeImage(bytes);
    await this.checkSize(image.width, image.height);
    this.pickingLayerIsland = false;
    this.islandMenu = null;
    await new Promise<void>(resolve => {
      this.finishImageImport = resolve;
      this.imageImport = { id: crypto.randomUUID(), image, name };
      this.emit();
    });
  }
  cancelImageImport() {
    this.imageImport = null;
    const finish = this.finishImageImport;
    this.finishImageImport = null;
    this.emit();
    finish?.();
  }
  async acceptImageImport(mask: HTMLCanvasElement | null, targetLayerId: string | null, binding?: { materialId: string; islandId: number } | null) {
    const pending = this.imageImport;
    if (!pending) return;
    let image = pending.image;
    if (mask) {
      const bounds = alphaBounds(mask);
      if (!bounds) throw new Error("Select an area or choose Whole image.");
      const selected = masked(image, mask);
      image = canvas(bounds.width, bounds.height);
      context(image).drawImage(selected, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height);
    }
    await this.importPreparedImage(image, pending.name, targetLayerId, binding);
    this.cancelImageImport();
  }
  async importImage(bytes: Uint8Array, name: string) {
    const image = await decodeImage(bytes);
    await this.checkSize(image.width, image.height);
    await this.importPreparedImage(image, name);
  }
  private async importPreparedImage(image: HTMLCanvasElement, name: string, targetLayerId: string | null = null, binding?: { materialId: string; islandId: number } | null) {
    this.textureFocusEnabled = true;
    const bindingDoc = binding ? this.docs.get(binding.materialId) : undefined;
    const boundIsland = bindingDoc?.islands.find(i => i.id === binding?.islandId);
    if (binding && (!boundIsland || (targetLayerId && binding.materialId !== this.activeId))) throw new Error("Choose an island belonging to the target material.");
    if (targetLayerId && !this.doc?.layers.some(layer => layer.id === targetLayerId))
      throw new Error("The target layer is no longer available.");
    if (!this.doc) await this.newCanvas(image.width, image.height);
    this.confirmTransform();
    if (binding && binding.materialId !== this.activeId) this.selectMaterial(binding.materialId);
    const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (const triangle of boundIsland?.triangles ?? []) for (const p of triangle) {
      bounds.minX=Math.min(bounds.minX,p.x); bounds.maxX=Math.max(bounds.maxX,p.x);
      bounds.minY=Math.min(bounds.minY,p.y); bounds.maxY=Math.max(bounds.maxY,p.y);
    }
    const offset = Number.isFinite(bounds.minX) ? {
      x: (bounds.minX + bounds.maxX) * this.doc!.width / 2 - image.width / 2,
      y: (bounds.minY + bounds.maxY) * this.doc!.height / 2 - image.height / 2,
    } : { x: 0, y: 0 };
    let rest = canvas(this.doc!.width, this.doc!.height);
    this.change("Import image", (d) => {
      const c = canvas(d.width, d.height);
      const ctx = context(c);
      const target = d.layers.find(layer => layer.id === targetLayerId);
      if (target) {
        rest = target.canvas;
        ctx.drawImage(rest, 0, 0);
      }
      ctx.drawImage(image, offset.x, offset.y);
      const l = target ?? this.makeLayer(c, name);
      if (!target) {
        l.uvBinding = d.layers.find(layer => layer.id === d.activeId)?.uvBinding;
        l.uvMask = editingMask(d, false);
        d.layers.push(l);
      } else {
        l.canvas = c;
        l.placement = undefined;
      }
      if (binding !== undefined) {
        l.uvBinding = boundIsland ? { uvSet: d.uvSet, island: boundIsland } : undefined;
        l.uvMask = boundIsland ? islandMask({ ...d, islands: [boundIsland], selectedIslands: [] }) : d.restrict ? islandMask({ ...d, selectedIslands: [] }) : null;
        d.selectedIslands = boundIsland ? [boundIsland.id] : [];
      }
      d.activeId = l.id;
      d.selection = null;
    });
    const d = this.doc!,
      points = [
        { x: offset.x, y: offset.y },
        { x: offset.x + image.width, y: offset.y },
        { x: offset.x + image.width, y: offset.y + image.height },
        { x: offset.x, y: offset.y + image.height },
      ];
    this.transform = {
      initialPlacement: true,
      kind: "free",
      source: image,
      rest,
      points,
      original: points.map((p) => ({ ...p })),
      before: snapshot(d),
      layerId: d.activeId,
      clip: this.layer?.uvMask ?? editingMask(d, false),
    };
    this.tool = "move";
    this.updateTransform(points);
  }
  updateLayer(id: string, patch: Partial<Omit<Layer, "canvas" | "id">>) {
    this.change("Layer properties", (d) => {
      d.layers = d.layers.map((l) => (l.id === id ? { ...l, ...patch } : l));
    });
  }
  selectLayer(id: string) {
    if (!this.doc?.layers.some(layer => layer.id === id)) return;
    this.pickingLayerIsland = false;
    this.confirmTransform();
    if (this.doc) {
      this.doc.activeId = id;
      const binding = this.layer?.uvBinding;
      this.doc.selectedIslands = binding?.uvSet === this.doc.uvSet ? [binding.island.id] : [];
      // Layer focus affects only the texture view. Manual 3D hiding stays intact.
      this.textureFocusEnabled = true;
      this.islandMenu = null;
    }
    this.emit();
  }
  setLayerIsland(id: number | null) {
    if (!this.doc || !this.layer) return;
    const island = this.doc.islands.find(i => i.id === id);
    if (id !== null && !island) return;
    this.textureFocusEnabled = true;
    this.pickingLayerIsland = false;
    this.change("Link layer to UV island", d => {
      const layer = d.layers.find(l => l.id === d.activeId)!;
      layer.uvBinding = island ? { uvSet: d.uvSet, island } : undefined;
      layer.uvMask = island
        ? islandMask({ ...d, islands: [island], selectedIslands: [] })
        : d.restrict ? islandMask({ ...d, selectedIslands: [] }) : null;
      d.selectedIslands = island ? [island.id] : [];
    });
  }
  toggleIslandPicker() {
    if (!this.layer || !this.doc?.islands.length) return;
    this.confirmTransform();
    this.pickingLayerIsland = !this.pickingLayerIsland;
    this.emit();
  }
  pickLayerIsland(id: number) {
    if (id < 0) return;
    this.setLayerIsland(id);
  }
  duplicateLayer() {
    const l = this.layer;
    if (l)
      this.change("Duplicate layer", (d) => {
        const copy = { ...l, id: crypto.randomUUID(), name: l.name + " copy" };
        d.layers.splice(d.layers.findIndex((x) => x.id === l.id) + 1, 0, copy);
        d.activeId = copy.id;
      });
  }
  deleteLayer() {
    if (this.layer)
      this.change("Delete layer", (d) => {
        d.layers = d.layers.filter((l) => l.id !== d.activeId);
        d.activeId = d.layers.at(-1)?.id ?? "";
      });
  }
  reorder(direction: number) {
    if (this.layer)
      this.change("Reorder layer", (d) => {
        const i = d.layers.findIndex((l) => l.id === d.activeId),
          j = i + direction;
        if (j < 0 || j >= d.layers.length) return;
        [d.layers[i], d.layers[j]] = [d.layers[j], d.layers[i]];
      });
  }
  mergeDown() {
    if (!this.doc) return;
    const index = this.doc.layers.findIndex((l) => l.id === this.doc!.activeId);
    if (index < 1) return;
    this.change("Merge down", (d) => {
      const lower = d.layers[index - 1],
        upper = d.layers[index];
      // Keep the destination mask live instead of baking it into its pixels twice.
      const merged = composite({ ...d, layers: [{ ...lower, uvMask: null }, upper] });
      d.layers.splice(index - 1, 2, {
        ...lower,
        canvas: merged,
        placement: undefined,
        opacity: 1,
        blend: "source-over",
        visible: true,
      });
      d.activeId = lower.id;
      d.selectedIslands = lower.uvBinding?.uvSet === d.uvSet ? [lower.uvBinding.island.id] : [];
    });
  }
  undo() {
    if (this.pickingLayerIsland) { this.pickingLayerIsland = false; this.emit(); }
    if (this.transform) {
      this.cancelTransform();
      return;
    }
    if (!this.doc) return;
    const d = this.history.undo(this.doc);
    if (d) {
      this.docs.set(this.activeId, d);
      this.emit(true);
    }
  }
  redo() {
    if (this.pickingLayerIsland) { this.pickingLayerIsland = false; this.emit(); }
    if (!this.doc || this.transform) return;
    const d = this.history.redo(this.doc);
    if (d) {
      this.docs.set(this.activeId, d);
      this.emit(true);
    }
  }
  setSelection(mask: HTMLCanvasElement, mode = this.selectionMode) {
    this.change("Selection", (d) => {
      d.selection = combineSelection(d.selection, mask, mode);
    });
  }
  deselect() {
    this.change("Deselect", (d) => {
      d.selection = null;
    });
  }
  invert() {
    this.change("Invert selection", (d) => {
      d.selection = invertSelection(d.selection, d.width, d.height);
    });
  }
  copy(cut = false, extract = false) {
    this.confirmTransform();
    if (!this.doc || !this.layer) return;
    const mask = this.doc.selection;
    this.clipboard = masked(this.layer.canvas, mask);
    if (cut || extract)
      this.change(extract ? "Extract fragment" : "Cut", (d) => {
        const l = d.layers.find((l) => l.id === d.activeId)!;
        l.canvas = mask
          ? masked(l.canvas, mask, true)
          : canvas(d.width, d.height);
        if (extract) {
          const added = this.makeLayer(this.clipboard!, l.name + " fragment");
          added.uvMask = l.uvMask ?? editingMask(d, false);
          added.uvBinding = l.uvBinding;
          d.layers.push(added);
          d.activeId = added.id;
          d.selection = null;
        }
      });
    this.notify(
      extract
        ? "Fragment extracted to its own layer."
        : cut
          ? "Selection cut."
          : "Selection copied.",
    );
  }
  paste() {
    if (!this.clipboard || !this.doc) return;
    this.change("Paste", (d) => {
      const c = canvas(d.width, d.height);
      context(c).drawImage(this.clipboard!, 0, 0);
      const l = this.makeLayer(c, "Pasted fragment");
      l.uvBinding = d.layers.find(layer => layer.id === d.activeId)?.uvBinding;
      l.uvMask = editingMask(d, false);
      d.layers.push(l);
      d.activeId = l.id;
      d.selection = null;
    });
  }
  clearPixels() {
    if (!this.doc || !this.layer) return;
    this.confirmTransform();
    // Repeated Delete must not bury the actual deletion under empty history entries.
    if (!alphaBounds(masked(this.layer!.canvas, this.doc!.selection))) return;
    this.change("Clear pixels", (d) => {
      const l = d.layers.find((l) => l.id === d.activeId)!;
      // Clearing a selection must also remove imported pixels outside UV islands.
      const mask = d.selection;
      l.canvas = mask
        ? masked(l.canvas, mask, true)
        : canvas(d.width, d.height);
    });
  }
  wand(p: Point, mode = this.selectionMode) {
    if (this.layer)
      this.setSelection(
        floodMask(this.layer.canvas, p.x, p.y, this.tolerance, this.contiguous),
        mode,
      );
  }
  fill(p: Point) {
    if (!this.layer || !this.doc || this.brushOpacity === 0) return;
    const doc = this.doc, binding = this.layer.uvBinding;
    if (p.x < 0 || p.y < 0 || p.x >= doc.width || p.y >= doc.height) return;
    if (binding && this.layer.uvMask && !context(this.layer.uvMask).getImageData(Math.floor(p.x), Math.floor(p.y), 1, 1).data[3]) return;
    let area: HTMLCanvasElement;
    if (doc.islands.length) {
      // Prefer the bound surface when separate surfaces have overlapping UVs.
      const islands = binding?.uvSet === doc.uvSet
        ? [binding.island, ...doc.islands.filter(i => i.id !== binding.island.id)]
        : doc.islands;
      const id = hitIsland({ ...doc, islands }, p);
      const island = islands.find(i => i.id === id);
      if (!island) return;
      area = islandMask({ ...doc, islands: [island], selectedIslands: [] });
    } else {
      // A standalone image without UVs retains ordinary color-based bucket fill.
      if (this.model || doc.restrict || binding) return;
      area = floodMask(this.layer.canvas, p.x, p.y, this.tolerance, this.contiguous);
    }
    // The pointer chooses the island; layer bindings and pixel selections still apply.
    const mask = editingMask({ ...doc, restrict: false, selectedIslands: [] });
    const ink = masked(area, mask);
    if (!alphaBounds(ink)) return;
    const ctx = context(ink);
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = this.color;
    ctx.globalAlpha = this.brushOpacity;
    ctx.fillRect(0, 0, ink.width, ink.height);
    this.change("Fill", (d) => {
      const l = d.layers.find((l) => l.id === d.activeId)!;
      l.canvas = cloneCanvas(l.canvas);
      context(l.canvas).drawImage(ink, 0, 0);
    });
  }
  pickColor(p: Point) {
    if (!this.output) return;
    const x = Math.min(this.output.width - 1, Math.max(0, Math.floor(p.x))),
      y = Math.min(this.output.height - 1, Math.max(0, Math.floor(p.y)));
    const data = context(this.output).getImageData(x, y, 1, 1).data;
    this.color =
      "#" +
      [...data.slice(0, 3)]
        .map((n) => n.toString(16).padStart(2, "0"))
        .join("");
    this.emit();
  }
  selectUVSet(value: string) {
    this.pickingLayerIsland = false;
    const slot = this.model?.slots.find((s) => s.id === this.activeId);
    if (!slot?.uvSets.includes(value)) return;
    const candidates = slot.sourceTextures
      .map((source, index) => ({ source, index }))
      .filter((t) => t.source.uvSet === value);
    const target =
      candidates.find((t) => t.index === this.doc?.sourceIndex) ??
      candidates[0];
    if (target && target.index !== this.doc?.sourceIndex) {
      this.selectTexture(target.index);
      this.notify(
        `${slot.uvLabels[value] ?? value}: opened ${target.source.name}.`,
      );
      return;
    }
    if (this.doc?.uvSet === value) return;
    this.change("UV set", (d) => {
      d.uvSet = value;
      d.selectedIslands = [];
      if (this.model) d.islands = extractIslands(this.model.scene, d.id, value);
    });
    this.notify(
      `${slot.uvLabels[value] ?? value}: ${target ? "texture mapping updated" : "no linked image; showing the current texture on this UV map"}.`,
    );
  }
  transferMaterialAlpha(sourceIndex: number, sourceUV: string) {
    const slot = this.model?.slots.find((s) => s.id === this.activeId);
    if (!this.model || !this.doc || !this.layer || !slot) return;
    const source = slot.sourceTextures[sourceIndex];
    if (!source) throw new Error("Choose an embedded source texture.");
    const alpha = transferAlpha(
      this.model,
      this.doc,
      source,
      sourceUV,
      this.warp,
    );
    this.change("Transfer alpha between UV maps", (doc) => {
      const layer = doc.layers.find((l) => l.id === doc.activeId)!;
      const result = cloneCanvas(layer.canvas),
        ctx = context(result);
      const pixels = ctx.getImageData(0, 0, doc.width, doc.height),
        mask = context(alpha).getImageData(0, 0, doc.width, doc.height).data;
      for (let i = 3; i < pixels.data.length; i += 4) pixels.data[i] = mask[i];
      ctx.putImageData(pixels, 0, 0);
      layer.canvas = result;
    });
    this.notify(
      `Alpha transferred from ${source.name} (${sourceUV}) to ${this.doc.uvSet}. RGB unchanged. Undo: Ctrl+Z.`,
    );
  }
  selectIsland(id: number, add = false) {
    this.confirmTransform();
    const d = this.doc;
    if (d) {
      d.selectedIslands =
        id < 0
          ? []
          : add
            ? d.selectedIslands.includes(id)
              ? d.selectedIslands.filter((i) => i !== id)
              : [...d.selectedIslands, id]
            : [id];
      this.emit();
    }
  }
  selectModelFace(meshId: string, triangle: number, add = false) {
    const d = this.doc;
    if (!d) return;
    const matches = (island: Island) => island.faces?.some(face => face.meshId === meshId && face.triangle === triangle);
    const island = d.islands.find(matches);
    if (!island) return;
    const candidates = d.layers.filter(layer => layer.uvBinding && matches(layer.uvBinding.island));
    const linked = candidates.find(layer => layer.id === d.activeId)
      ?? candidates.slice().reverse().find(layer => layer.visible)
      ?? candidates.at(-1);
    const selection = [...d.selectedIslands];
    if (linked && linked.id !== d.activeId) this.selectLayer(linked.id);
    if (add && this.doc) this.doc.selectedIslands = selection;
    this.selectIsland(island.id, add);
  }
  selectCanvasIsland(id: number, add = false) {
    if (id < 0) {
      this.clearCanvasSelection();
      return;
    }
    this.confirmTransform();
    const d = this.doc;
    if (!d) return;
    const candidates = d.layers.filter(l => l.uvBinding?.uvSet === d.uvSet && l.uvBinding.island.id === id);
    const linked = candidates.find(l => l.id === d.activeId)
      ?? candidates.slice().reverse().find(l => l.visible) ?? candidates.at(-1);
    const selection = [...d.selectedIslands];
    // Restore 2D focus even when this linked layer is already active after
    // clearing the frame. This never touches manual 3D face visibility.
    if (linked) this.selectLayer(linked.id);
    if (add) d.selectedIslands = selection;
    this.selectIsland(id, add);
  }
  clearCanvasSelection() {
    this.confirmTransform();
    this.textureFocusEnabled = false;
    this.pickingLayerIsland = false;
    this.islandMenu = null;
    if (this.doc) {
      this.doc.selectedIslands = [];
      this.doc.selection = null;
    }
    this.emit();
  }
  setTool(tool: Tool) {
    this.pickingLayerIsland = false;
    if (tool === "move") {
      this.tool = tool;
      this.beginTransform(this.transform?.kind ?? "free");
      this.emit();
      return;
    }
    this.confirmTransform();
    this.tool = tool;
    this.emit();
  }
  beginTransform(kind: "free" | "perspective" | "mesh" = "free") {
    if (this.transform) {
      if (this.transform.kind === kind) return;
      if (this.transform.kind !== "mesh" && kind !== "mesh") {
        this.transform.kind = kind;
        this.emit();
        return;
      }
      this.confirmTransform();
    }
    if (!this.doc || !this.layer) return;
    const before = snapshot(this.doc),
      selection = this.doc.selection;
    // Reuse the full source after applying a placement, including off-canvas
    // pixels. Pixel edits replace the rendered canvas and invalidate this cache.
    const placement = this.layer.placement;
    if (
      !selection &&
      placement?.rendered === this.layer.canvas &&
      (placement.kind === "mesh") === (kind === "mesh")
    ) {
      const points = placement.points.map((p) => ({ ...p }));
      this.transform = {
        kind,
        source: placement.source,
        rest: placement.rest,
        points,
        original: points.map((p) => ({ ...p })),
        before,
        layerId: this.layer.id,
        clip: this.layer.uvMask ?? null,
        outside: this.layer.uvMask ? masked(this.layer.canvas, this.layer.uvMask, true) : undefined,
      };
      this.tool = "move";
      this.emit();
      return;
    }
    const picked = masked(this.layer.canvas, selection);
    const bounds = alphaBounds(picked);
    if (!bounds) {
      this.notify(
        "This layer or selection has no visible pixels to transform.",
      );
      return;
    }
    const source = canvas(bounds.width, bounds.height);
    context(source).drawImage(
      picked,
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
      0,
      0,
      bounds.width,
      bounds.height,
    );
    const rest = selection
      ? masked(this.layer.canvas, selection, true)
      : canvas(this.doc.width, this.doc.height);
    const { x, y, width: w, height: h } = bounds;
    const points =
      kind !== "mesh"
        ? [
            { x, y },
            { x: x + w, y },
            { x: x + w, y: y + h },
            { x, y: y + h },
          ]
        : Array.from({ length: 16 }, (_, i) => ({
            x: x + ((i % 4) * w) / 3,
            y: y + (Math.floor(i / 4) * h) / 3,
          }));
    this.transform = {
      kind,
      source,
      rest,
      points,
      original: points.map((p) => ({ ...p })),
      before,
      layerId: this.layer.id,
      clip: this.layer.uvMask ?? null,
      outside: this.layer.uvMask ? masked(this.layer.canvas, this.layer.uvMask, true) : undefined,
    };
    this.tool = "move";
    this.emit();
  }
  scheduleTransform(points: Point[]) {
    if (!this.transform) return;
    this.pendingTransform = { session: this.transform, points };
    if (!this.transformFrame)
      this.transformFrame = requestAnimationFrame(() => this.flushTransform(true));
  }
  flushTransform(interactive = false) {
    if (this.transformFrame) cancelAnimationFrame(this.transformFrame);
    this.transformFrame = 0;
    const pending = this.pendingTransform;
    this.pendingTransform = null;
    if (pending && this.transform === pending.session) this.updateTransform(pending.points, interactive);
    else if (!interactive && this.reducedPreview && this.doc && this.output) {
      const slot = this.model?.slots.find((s) => s.id === this.activeId);
      if (slot) syncMaterial(slot, this.doc, this.output);
      this.reducedPreview = false;
    }
  }
  updateTransform(points: Point[], interactive = false) {
    const t = this.transform,
      d = this.doc;
    if (!t || !d) return;
    try {
      const warped = this.warp.render(
        t.source,
        points,
        t.kind === "mesh" ? "mesh" : "perspective",
        d.width,
        d.height,
        t.warped,
      );
      t.warped = warped;
      const c = t.raster ?? (t.raster = canvas(d.width, d.height, false));
      const ctx = context(c);
      ctx.clearRect(0, 0, d.width, d.height);
      ctx.drawImage(t.rest, 0, 0);
      ctx.drawImage(warped, 0, 0);
      t.outside = t.clip
        ? masked(warped, t.clip, true, t.outside ?? canvas(d.width, d.height, false))
        : undefined;
      const next = snapshot(d);
      const layer = next.layers.find((l) => l.id === t.layerId)!;
      layer.canvas = c;
      layer.placement = t.before.selection ? undefined : {
        source: t.source,
        rest: t.rest,
        points: points.map((p) => ({ ...p })),
        kind: t.kind,
        rendered: c,
      };
      this.docs.set(this.activeId, next);
      t.points = points;
      this.emit(true, interactive);
    } catch (e) {
      this.message = e instanceof Error ? e.message : String(e);
      this.emit();
    }
  }
  adjustTransform(sx: number, sy: number, degrees = 0) {
    this.beginTransform(this.transform?.kind ?? "free");
    const t = this.transform;
    if (!t) return;
    const cx = t.points.reduce((a, p) => a + p.x, 0) / t.points.length,
      cy = t.points.reduce((a, p) => a + p.y, 0) / t.points.length,
      r = (degrees * Math.PI) / 180;
    this.updateTransform(
      t.points.map((p) => {
        const x = (p.x - cx) * sx,
          y = (p.y - cy) * sy;
        return {
          x: cx + x * Math.cos(r) - y * Math.sin(r),
          y: cy + x * Math.sin(r) + y * Math.cos(r),
        };
      }),
    );
  }
  confirmTransform() {
    this.flushTransform();
    if (!this.transform) return;
    // Merely showing the frame (or returning it to its starting position)
    // must preserve the exact pixels, layer mask and undo history.
    if (!this.transform.initialPlacement && this.transform.points.every((p, i) =>
      Math.abs(p.x - this.transform!.original[i].x) < 1e-8 && Math.abs(p.y - this.transform!.original[i].y) < 1e-8)) {
      this.cancelTransform();
      return;
    }
    this.history.push(
      this.transform.kind === "mesh"
        ? "Mesh warp"
        : this.transform.kind === "free"
          ? "Free transform"
          : "Perspective transform",
      this.transform.before,
    );
    if (this.doc) this.doc.selection = null;
    this.transform = null;
    this.emit(true);
  }
  cancelTransform() {
    if (this.transformFrame) cancelAnimationFrame(this.transformFrame);
    this.transformFrame = 0;
    this.pendingTransform = null;
    if (!this.transform) return;
    this.docs.set(this.activeId, snapshot(this.transform.before));
    this.transform = null;
    this.emit(true);
  }
  async export() {
    this.confirmTransform();
    if (!this.doc) return;
    const path = await exportPNG(this.doc);
    if (path) this.notify(`Exported ${path}`);
  }
}
export const editor = new Editor();
