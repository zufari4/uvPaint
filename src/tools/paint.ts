import type { Editor } from "../core/editor";
import type { Point, TextureDocument } from "../types";
import { canvas, cloneCanvas, context, masked } from "../core/canvas";
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
  constructor(
    public editor: Editor,
    p: Point,
  ) {
    const d = editor.doc!;
    this.before = snapshot(d);
    this.base = editor.layer!.canvas;
    this.ink = canvas(d.width, d.height);
    this.clip = editingMask(d);
    this.last = this.start = p;
    this.clone = editor.tool === "clone" ? cloneCanvas(this.base) : null;
    this.draw(p);
  }
  draw(p: Point) {
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
    this.last = p;
    const c = cloneCanvas(this.base);
    const x = context(c);
    x.globalAlpha = e.brushOpacity;
    x.globalCompositeOperation =
      e.tool === "eraser" ? "destination-out" : "source-over";
    x.drawImage(masked(this.ink, this.clip), 0, 0);
    const next = snapshot(e.doc!);
    next.layers.find((l) => l.id === next.activeId)!.canvas = c;
    e.docs.set(e.activeId, next);
    e.emit(true);
  }
  finish() {
    this.editor.history.push(
      this.editor.tool === "eraser"
        ? "Erase"
        : this.editor.tool === "clone"
          ? "Clone stamp"
          : "Brush stroke",
      this.before,
    );
    this.editor.emit();
  }
  cancel() {
    this.editor.docs.set(this.editor.activeId, this.before);
    this.editor.emit(true);
  }
}
