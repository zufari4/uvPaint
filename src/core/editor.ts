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
import { demoModel } from "../import/demo";
import { decodeImage, pickFile } from "../import/files";
import { exportPNG } from "../export/png";
import { syncMaterial } from "../render/material";
import { transferAlpha } from "../tools/alpha-transfer";
import { loadPreferences, preferenceKey } from "./preferences";
import { faceKey } from "../tools/uv-guides";
import { sourceGeometry } from "../render/mesh-source";

export class Editor {
  docs = new Map<string, TextureDocument>();
  textureDocuments = new Map<string, TextureDocument>();
  histories = new Map<string, History>();
  activeId = "";
  model: ModelAsset | null = null;
  tool: Tool = "move";
  selectionMode: SelectionMode = "replace";
  color = "#f06b4f";
  backgroundColor = "#ffffff";
  brushSize = 32;
  brushOpacity = 1;
  tolerance = 24;
  contiguous = true;
  uvDisplay: UVDisplayMode = "off";
  hiddenFaces = new Set<string>();
  islandMenu: {x:number; y:number} | null = null;
  pickingLayerIsland = false;
  imageImport: { id: string; image: HTMLCanvasElement; name: string } | null = null;
  private finishImageImport: (() => void) | null = null;
  private visibleCache: {islands:Island[]; hidden:Set<string>; result:Island[]} | null = null;
  private selectedCache: {islands:Island[]; ids:string; result:Set<string>} | null = null;
  uvColor = "#a5ece0";
  uvOpacity = 0.65;
  textScale = 1.4;
  previewMode: "unlit" | "studio" = "studio";
  previewEdges = false;
  transform: TransformSession | null = null;
  private transformFrame = 0;
  private pendingTransform: { session: TransformSession; points: Point[] } | null = null;
  private dragPreview: HTMLCanvasElement | null = null;
  private reducedPreview = false;
  cloneSource: Point | null = null;
  message = "Open a GLB to start, or create a texture.";
  notice: { id: number; text: string } | null = null;
  error = "";
  busy = false;
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
  }
  setUVDisplay(mode: UVDisplayMode) { this.uvDisplay = mode; this.savePreferences(); }
  get visibleIslands(): Island[] {
    const islands = this.doc?.islands;
    if (!islands) return [];
    if (this.visibleCache?.islands === islands && this.visibleCache.hidden === this.hiddenFaces) return this.visibleCache.result;
    const result = islands.map(island => {
      if (!island.faces) return island;
      const indices = island.faces.map((f,i)=>this.hiddenFaces.has(faceKey(f)) ? -1 : i).filter(i=>i>=0);
      if (indices.length === island.triangles.length) return island;
      return {...island, triangles: indices.map(i=>island.triangles[i]), faces: indices.map(i=>island.faces![i])};
    }).filter(i=>i.triangles.length);
    this.visibleCache={islands,hidden:this.hiddenFaces,result};
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
    if (action === "isolate") for (const part of this.model?.parts ?? []) {
      const g=sourceGeometry(part), count=(g.index?.count ?? g.getAttribute("position").count)/3;
      for(let i=0;i<count;i++) {const key=faceKey({meshId:part.uuid,triangle:i});if(!selected.has(key))hidden.add(key);}
    }
    this.hiddenFaces=hidden; this.islandMenu=null; this.emit();
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
  private savePreferences() {
    try {
      localStorage.setItem(
        preferenceKey,
        JSON.stringify({
          uvColor: this.uvColor,
          uvOpacity: this.uvOpacity,
          textScale: this.textScale,
          uvDisplay: this.uvDisplay,
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
    const file = await pickFile("model");
    if (file) await this.importModel(file.bytes, file.name);
  }
  async importModel(bytes: Uint8Array, name: string) {
    const result = await loadGLB(new Uint8Array(bytes).buffer, name, (w, h) =>
      this.checkSize(w, h),
    );
    this.install(result);
  }
  async sample() {
    this.install(await demoModel((w, h) => this.checkSize(w, h)));
  }
  install({ model, docs }: { model: ModelAsset; docs: TextureDocument[] }) {
    if (this.model) disposeModel(this.model);
    this.model = model;
    this.hiddenFaces = new Set();
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
    this.pickingLayerIsland = false;
    this.confirmTransform();
    this.activeId = id;
    this.output = null;
    this.cloneSource = null;
    this.emit(true);
  }
  selectTexture(sourceIndex: number) {
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
  async acceptImageImport(mask: HTMLCanvasElement | null, targetLayerId: string | null) {
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
    await this.importPreparedImage(image, pending.name, targetLayerId);
    this.cancelImageImport();
  }
  async importImage(bytes: Uint8Array, name: string) {
    const image = await decodeImage(bytes);
    await this.checkSize(image.width, image.height);
    await this.importPreparedImage(image, name);
  }
  private async importPreparedImage(image: HTMLCanvasElement, name: string, targetLayerId: string | null = null) {
    if (targetLayerId && !this.doc?.layers.some(layer => layer.id === targetLayerId))
      throw new Error("The target layer is no longer available.");
    if (!this.doc) await this.newCanvas(image.width, image.height);
    this.confirmTransform();
    const targetMask = targetLayerId ? this.doc!.layers.find(layer => layer.id === targetLayerId)!.uvMask ?? null : null;
    let rest = canvas(this.doc!.width, this.doc!.height);
    this.change("Import image", (d) => {
      const c = canvas(d.width, d.height);
      const ctx = context(c);
      const target = d.layers.find(layer => layer.id === targetLayerId);
      if (target) {
        rest = target.canvas;
        ctx.drawImage(rest, 0, 0);
      }
      ctx.drawImage(image, 0, 0);
      const l = target ?? this.makeLayer(c, name);
      if (!target) {
        l.uvBinding = d.layers.find(layer => layer.id === d.activeId)?.uvBinding;
        l.uvMask = editingMask(d, false);
        d.layers.push(l);
      } else {
        l.canvas = c;
        l.placement = undefined;
      }
      d.activeId = l.id;
      d.selection = null;
    });
    const d = this.doc!,
      points = [
        { x: 0, y: 0 },
        { x: image.width, y: 0 },
        { x: image.width, y: image.height },
        { x: 0, y: image.height },
      ];
    this.transform = {
      kind: "free",
      source: image,
      rest,
      points,
      original: points.map((p) => ({ ...p })),
      before: snapshot(d),
      layerId: d.activeId,
      clip: targetLayerId ? targetMask : editingMask(d, false),
    };
    this.tool = "move";
    this.updateTransform(points);
    this.notify(
      `Imported ${image.width} × ${image.height} at native size. Full source retained while placing; Enter applies.`,
    );
  }
  updateLayer(id: string, patch: Partial<Omit<Layer, "canvas" | "id">>) {
    this.change("Layer properties", (d) => {
      d.layers = d.layers.map((l) => (l.id === id ? { ...l, ...patch } : l));
    });
  }
  selectLayer(id: string) {
    this.pickingLayerIsland = false;
    this.confirmTransform();
    if (this.doc) {
      this.doc.activeId = id;
      const binding = this.layer?.uvBinding;
      this.doc.selectedIslands = binding?.uvSet === this.doc.uvSet ? [binding.island.id] : [];
    }
    this.emit();
  }
  setLayerIsland(id: number | null) {
    if (!this.doc || !this.layer) return;
    const island = this.doc.islands.find(i => i.id === id);
    if (id !== null && !island) return;
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
    if (id < 0) {
      this.notify("Choose a UV island of the active material. Escape cancels picking.");
      return;
    }
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
      const merged = composite({ ...d, layers: [lower, upper] });
      d.layers.splice(index - 1, 2, {
        ...lower,
        name: lower.name + " + " + upper.name,
        canvas: merged,
        uvMask: null,
        uvBinding: undefined,
        placement: undefined,
        opacity: 1,
        blend: "source-over",
        visible: true,
      });
      d.activeId = lower.id;
    });
    this.notify(
      "Merged pair flattened against transparency; backdrop-dependent blends can change when merged.",
    );
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
  setTool(tool: Tool) {
    this.pickingLayerIsland = false;
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
        clip: editingMask(this.doc, false),
      };
      this.tool = "move";
      this.updateTransform(points);
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
      clip: editingMask(this.doc, false),
    };
    this.tool = "move";
    this.updateTransform(points);
    this.notify(
      "Drag handles or the fragment. Enter applies · Escape cancels.",
    );
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
      layer.uvMask = t.clip;
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
