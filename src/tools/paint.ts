import type { Editor } from "../core/editor";
import type { Point, TextureDocument } from "../types";
import {
  canvas,
  context,
  alphaBounds,
} from "../core/canvas";
import { snapshot } from "../core/history";
import { editingMask } from "./uv";
export class PaintStroke {
  before: TextureDocument;
  ink: HTMLCanvasElement;
  base: HTMLCanvasElement;
  clip: HTMLCanvasElement | null;
  last: Point;
  start: Point;
  clone: HTMLCanvasElement | null;
  private working: HTMLCanvasElement;
  private clipped: HTMLCanvasElement;
  private dirty: { left: number; top: number; right: number; bottom: number } | null = null;
  private frame = 0;
  private ended = false;
  private tool: Editor["tool"];
  constructor(
    public editor: Editor,
    p: Point,
  ) {
    const d = editor.doc!;
    const layer = editor.layer;
    if (!layer)
      throw new Error("Select a layer or add an empty layer before painting.");
    if (!layer.visible)
      throw new Error(
        "The active layer is hidden. Enable its eye icon before painting.",
      );
    if (layer.opacity === 0)
      throw new Error(
        "The active layer opacity is 0%. Increase it before painting.",
      );
    if (editor.brushOpacity === 0)
      throw new Error("Brush opacity is 0%. Increase Opacity to paint.");
    if (d.restrict && !d.islands.length && !layer.uvBinding)
      throw new Error(
        "This UV map has no islands. Choose another UV map or disable UV clipping.",
      );
    if (d.selection && !alphaBounds(d.selection))
      throw new Error(
        "The selection is empty. Press Ctrl+D or Clear selection before painting.",
      );
    this.before = snapshot(d);
    this.base = editor.layer!.canvas;
    this.ink = canvas(d.width, d.height, false);
    this.working = canvas(d.width, d.height, false);
    context(this.working).drawImage(this.base, 0, 0);
    this.clipped = canvas(d.width, d.height, false);
    this.clip = editingMask(d);
    this.last = this.start = p;
    this.tool = editor.tool;
    this.clone = this.tool === "clone" ? this.base : null;
    const next = snapshot(d);
    next.layers.find(l => l.id === next.activeId)!.canvas = this.working;
    editor.docs.set(editor.activeId, next);
    this.draw(p);
  }
  draw(p: Point) {
    if (this.ended) return;
    const e = this.editor,
      ctx = context(this.ink);
    const distance = Math.hypot(p.x - this.last.x, p.y - this.last.y),
      steps = Math.max(1, Math.ceil(distance / Math.max(1, e.brushSize / 5)));
    for (let i = 1; i <= steps; i++) {
      const x = this.last.x + ((p.x - this.last.x) * i) / steps,
        y = this.last.y + ((p.y - this.last.y) * i) / steps;
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, e.brushSize / 2, 0, Math.PI * 2);
      if (this.clone && e.cloneSource) {
        ctx.clip();
        const dx = this.start.x - e.cloneSource.x,
          dy = this.start.y - e.cloneSource.y;
        ctx.drawImage(this.clone, dx, dy);
      } else {
        ctx.fillStyle = e.color;
        ctx.fill();
      }
      ctx.restore();
    }
    const pad = e.brushSize / 2 + 2;
    const bounds = {
      left: Math.max(0, Math.floor(Math.min(this.last.x, p.x) - pad)),
      top: Math.max(0, Math.floor(Math.min(this.last.y, p.y) - pad)),
      right: Math.min(this.base.width, Math.ceil(Math.max(this.last.x, p.x) + pad)),
      bottom: Math.min(this.base.height, Math.ceil(Math.max(this.last.y, p.y) + pad)),
    };
    if (bounds.right > bounds.left && bounds.bottom > bounds.top) {
      const old = this.dirty;
      this.dirty = old ? {
        left: Math.min(old.left, bounds.left), top: Math.min(old.top, bounds.top),
        right: Math.max(old.right, bounds.right), bottom: Math.max(old.bottom, bounds.bottom),
      } : bounds;
    }
    this.last = p;
    if (!this.frame) this.frame = requestAnimationFrame(() => this.flush(true));
  }
  private flush(interactive: boolean) {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    const dirty = this.dirty;
    this.dirty = null;
    const e = this.editor;
    if (!dirty) { if (!interactive) e.emit(true); return; }
    const { left, top } = dirty, w = dirty.right - left, h = dirty.bottom - top;
    const draw = (ctx: CanvasRenderingContext2D, image: HTMLCanvasElement) =>
      ctx.drawImage(image, left, top, w, h, left, top, w, h);
    const ink = context(this.clipped);
    ink.clearRect(left, top, w, h);
    draw(ink, this.ink);
    if (this.clip) {
      ink.globalCompositeOperation = "destination-in";
      draw(ink, this.clip);
      ink.globalCompositeOperation = "source-over";
    }
    const x = context(this.working);
    x.clearRect(left, top, w, h);
    draw(x, this.base);
    x.globalAlpha = e.brushOpacity;
    x.globalCompositeOperation =
      this.tool === "eraser" ? "destination-out" : "source-over";
    draw(x, this.clipped);
    x.globalAlpha = 1;
    x.globalCompositeOperation = "source-over";
    e.emit(true, interactive);
  }
  finish() {
    if (this.ended) return;
    this.flush(false);
    this.ended = true;
    this.editor.history.push(
      this.tool === "eraser"
        ? "Erase"
        : this.tool === "clone"
          ? "Clone stamp"
          : "Brush stroke",
      this.before,
    );
    this.editor.emit();
  }
  cancel() {
    if (this.ended) return;
    this.ended = true;
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.dirty = null;
    this.editor.docs.set(this.editor.activeId, this.before);
    this.editor.emit(true);
  }
}
