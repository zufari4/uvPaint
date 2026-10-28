import type {
  Layer,
  ModelAsset,
  Point,
  SelectionMode,
  TextureDocument,
  Tool,
  TransformSession,
} from "../types";
import { canvas, context, cloneCanvas, masked, alphaBounds } from "./canvas";
import { History, snapshot } from "./history";
import { composite } from "../render/composite";
import { WarpRenderer } from "../render/warp";
import { editingMask, extractIslands } from "../tools/uv";
import {
  combineSelection,
  invertSelection,
  floodMask,
} from "../tools/selection";
import { loadGLB, disposeModel } from "../import/model";
import { demoModel } from "../import/demo";
import { decodeImage, pickFile } from "../import/files";
import { exportPNG } from "../export/png";

export class Editor {
  docs = new Map<string, TextureDocument>();
  histories = new Map<string, History>();
  activeId = "";
  model: ModelAsset | null = null;
  tool: Tool = "move";
  selectionMode: SelectionMode = "replace";
  color = "#f06b4f";
  brushSize = 32;
  brushOpacity = 1;
  tolerance = 24;
  contiguous = true;
  uvVisible = true;
  uvColor = "#a5ece0";
  uvOpacity = 0.65;
  transform: TransformSession | null = null;
  cloneSource: Point | null = null;
  message = "Open a GLB to start, or create a texture.";
  error = "";
  busy = false;
  revision = 0;
  pixelsRevision = 0;
  clipboard: HTMLCanvasElement | null = null;
  output: HTMLCanvasElement | null = null;
  private listeners = new Set<() => void>();
  private warpInstance: WarpRenderer | null = null;
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
    if (!this.histories.has(this.activeId))
      this.histories.set(this.activeId, new History());
    return this.histories.get(this.activeId)!;
  }
  get warp() {
    return this.warpInstance ?? (this.warpInstance = new WarpRenderer());
  }
  emit(pixels = false) {
    if (pixels && this.doc) {
      this.pixelsRevision++;
      this.output = composite(this.doc, this.output ?? undefined);
      const slot = this.model?.slots.find((s) => s.id === this.activeId);
      if (slot) {
        slot.texture.image = this.output;
        slot.texture.needsUpdate = true;
      }
    }
    this.revision++;
    this.listeners.forEach((fn) => fn());
  }
  notify(message: string) {
    this.message = message;
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
    this.docs.clear();
    this.histories.clear();
    for (const d of docs) this.docs.set(d.id, d);
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
          return { ...l, canvas: c };
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
    this.confirmTransform();
    this.activeId = id;
    this.output = null;
    this.cloneSource = null;
    this.emit(true);
  }
  change(label: string, fn: (d: TextureDocument) => void) {
    if (!this.doc) return;
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
    if (file) await this.importImage(file.bytes, file.name);
  }
  async importImage(bytes: Uint8Array, name: string) {
    const image = await decodeImage(bytes);
    await this.checkSize(image.width, image.height);
    if (!this.doc) await this.newCanvas(image.width, image.height);
    this.change("Import image", (d) => {
      const c = canvas(d.width, d.height);
      const ctx = context(c);
      ctx.drawImage(image, 0, 0);
      const l = this.makeLayer(masked(c, editingMask(d, false)), name);
      d.layers.push(l);
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
      kind: "perspective",
      source: image,
      rest: canvas(d.width, d.height),
      points,
      original: points.map((p) => ({ ...p })),
      before: snapshot(d),
      layerId: d.activeId,
      clip: editingMask(d, false),
    };
    this.tool = "move";
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
    this.confirmTransform();
    if (this.doc) this.doc.activeId = id;
    this.emit();
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
    if (!this.doc || !this.layer) return;
    const mask = editingMask(this.doc);
    this.clipboard = masked(this.layer.canvas, mask);
    if (cut || extract)
      this.change(extract ? "Extract fragment" : "Cut", (d) => {
        const l = d.layers.find((l) => l.id === d.activeId)!;
        l.canvas = mask
          ? masked(l.canvas, mask, true)
          : canvas(d.width, d.height);
        if (extract) {
          const added = this.makeLayer(this.clipboard!, l.name + " fragment");
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
      const l = this.makeLayer(
        masked(c, editingMask(d, false)),
        "Pasted fragment",
      );
      d.layers.push(l);
      d.activeId = l.id;
      d.selection = null;
    });
  }
  clearPixels() {
    if (!this.doc || !this.layer) return;
    this.change("Clear pixels", (d) => {
      const l = d.layers.find((l) => l.id === d.activeId)!;
      const mask = editingMask(d);
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
    if (!this.layer || !this.doc) return;
    const area = floodMask(
      this.layer.canvas,
      p.x,
      p.y,
      this.tolerance,
      this.contiguous,
    );
    const mask = editingMask(this.doc);
    const ink = masked(area, mask);
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
    this.change("UV set", (d) => {
      d.uvSet = value;
      d.selectedIslands = [];
      if (this.model) d.islands = extractIslands(this.model.scene, d.id, value);
    });
  }
  selectIsland(id: number, add = false) {
    this.change("Select UV island", (d) => {
      d.selectedIslands =
        id < 0
          ? []
          : add
            ? d.selectedIslands.includes(id)
              ? d.selectedIslands.filter((i) => i !== id)
              : [...d.selectedIslands, id]
            : [id];
    });
  }
  setTool(tool: Tool) {
    this.confirmTransform();
    this.tool = tool;
    this.emit();
  }
  beginTransform(kind: "perspective" | "mesh" = "perspective") {
    if (this.transform) {
      if (this.transform.kind === kind) return;
      this.confirmTransform();
    }
    if (!this.doc || !this.layer) return;
    const before = snapshot(this.doc),
      selection = editingMask(this.doc);
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
      kind === "perspective"
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
    this.notify(
      "Drag handles or the fragment. Enter applies · Escape cancels.",
    );
  }
  updateTransform(points: Point[]) {
    const t = this.transform,
      d = this.doc;
    if (!t || !d) return;
    try {
      const warped = this.warp.render(
        t.source,
        points,
        t.kind,
        d.width,
        d.height,
      );
      const c = cloneCanvas(t.rest);
      context(c).drawImage(masked(warped, t.clip), 0, 0);
      const next = snapshot(d);
      next.layers.find((l) => l.id === t.layerId)!.canvas = c;
      this.docs.set(this.activeId, next);
      t.points = points;
      this.emit(true);
    } catch (e) {
      this.message = e instanceof Error ? e.message : String(e);
      this.emit();
    }
  }
  adjustTransform(sx: number, sy: number, degrees = 0) {
    this.beginTransform(this.transform?.kind ?? "perspective");
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
    if (!this.transform) return;
    this.history.push(
      this.transform.kind === "mesh" ? "Mesh warp" : "Perspective transform",
      this.transform.before,
    );
    if (this.doc) this.doc.selection = null;
    this.transform = null;
    this.emit(true);
  }
  cancelTransform() {
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
