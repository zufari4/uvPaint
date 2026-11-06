import type { Editor } from "../core/editor";
import type { Point, TextureDocument } from "../types";
import {
  canvas,
  context,
  alphaBounds,
} from "../core/canvas";
import { snapshot } from "../core/history";
import { editingMask } from "./uv";
import { shapeFrame } from "./shape-geometry";
import { drawText, textBounds } from "./text";
const rgba = (hex: string, alpha: number) =>
  `rgba(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(",")},${alpha})`;
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
  private lineBounds: { left: number; top: number; right: number; bottom: number } | null = null;
  private frame = 0;
  private ended = false;
  private tool: Editor["tool"];
  private hardness = 1;
  private angle = 0;
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
    if (editor.brushOpacity === 0 && editor.tool !== "gradient" && editor.tool !== "text" && !(editor.tool === "line" && editor.shape.kind !== "line"))
      throw new Error("The paint color is fully transparent. Raise its alpha to paint.");
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
    // Shapes and the eraser on island-linked layers also reach pixels beyond the island; the layer mask hides them.
    this.clip = (editor.tool === "line" || editor.tool === "text" || editor.tool === "eraser") && layer.uvBinding ? d.selection ?? null : editingMask(d);
    this.last = this.start = p;
    this.tool = editor.tool;
    this.clone = this.tool === "clone" ? this.base : null;
    // Aligned clone: the first stroke fixes the offset, later strokes keep sampling relative to it.
    if (this.clone && editor.cloneSource && !editor.cloneOffset)
      editor.cloneOffset = { x: p.x - editor.cloneSource.x, y: p.y - editor.cloneSource.y };
    this.hardness = this.tool === "brush" || this.tool === "eraser" ? editor.brushHardness : 1;
    const next = snapshot(d);
    next.layers.find(l => l.id === next.activeId)!.canvas = this.working;
    editor.docs.set(editor.activeId, next);
    this.draw(p);
  }
  draw(p: Point) {
    if (this.ended) return;
    const e = this.editor,
      ctx = context(this.ink);
    // Shapes and gradients redraw completely from the press point on every move.
    const editable = this.tool === "line" || this.tool === "gradient" || this.tool === "text";
    const from = editable ? this.start : this.last;
    let box = { left: Math.min(from.x, p.x), top: Math.min(from.y, p.y), right: Math.max(from.x, p.x), bottom: Math.max(from.y, p.y) };
    if (this.tool === "text") {
      const text = e.lineEdit?.stroke === this ? e.lineEdit.text ?? "" : "";
      ctx.clearRect(0, 0, this.ink.width, this.ink.height);
      drawText(ctx, e.textOptions, text, from, { color: e.color, alpha: e.colorAlpha }, { color: e.backgroundColor, alpha: e.backgroundAlpha });
      const b = textBounds(e.textOptions, text, from);
      box = { left: b.x, top: b.y, right: b.x + b.width, bottom: b.y + b.height };
    } else if (this.tool === "gradient") {
      const { width: w, height: h } = this.ink, r = Math.hypot(p.x - from.x, p.y - from.y);
      ctx.clearRect(0, 0, w, h);
      if (r > 0) {
        const g = e.gradient === "radial"
          ? ctx.createRadialGradient(from.x, from.y, 0, from.x, from.y, r)
          : ctx.createLinearGradient(from.x, from.y, p.x, p.y);
        g.addColorStop(0, rgba(e.color, e.colorAlpha));
        g.addColorStop(1, rgba(e.backgroundColor, e.backgroundAlpha));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
      box = { left: 0, top: 0, right: w, bottom: h };
    } else if (this.tool === "line") {
      const shape = e.shape, width = shape.kind === "line" ? e.brushSize : shape.width;
      ctx.clearRect(0, 0, this.ink.width, this.ink.height);
      ctx.save();
      ctx.fillStyle = ctx.strokeStyle = e.color;
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      ctx.beginPath();
      if (from.x === p.x && from.y === p.y) {
        ctx.arc(p.x, p.y, width / 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (shape.kind === "line") {
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      } else {
        if (shape.kind === "rect" || shape.kind === "ellipse") {
          const frame = shapeFrame(from, p, this.angle);
          if (shape.kind === "rect") {
            for (const q of frame.corners) ctx.lineTo(q.x, q.y);
            ctx.closePath();
          } else ctx.ellipse(frame.center.x, frame.center.y, frame.halfWidth, frame.halfHeight, this.angle, 0, Math.PI * 2);
          const xs = frame.corners.map(q => q.x), ys = frame.corners.map(q => q.y);
          box = { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
        } else {
          // Regular polygon: the first point is the centre, the second one a vertex.
          const r = Math.hypot(p.x - from.x, p.y - from.y), start = Math.atan2(p.y - from.y, p.x - from.x);
          for (let i = 0; i < shape.sides; i++) {
            const a = start + (i * Math.PI * 2) / shape.sides;
            ctx.lineTo(from.x + Math.cos(a) * r, from.y + Math.sin(a) * r);
          }
          ctx.closePath();
          box = { left: from.x - r, top: from.y - r, right: from.x + r, bottom: from.y + r };
        }
        ctx.lineJoin = "miter";
        // Shapes carry their own alphas: fill in the primary color, outline in the secondary one.
        if (shape.fill) {
          ctx.globalAlpha = e.colorAlpha;
          ctx.fillStyle = e.color;
          ctx.fill();
        }
        if (shape.outline || !shape.fill) {
          ctx.globalAlpha = e.backgroundAlpha;
          ctx.strokeStyle = e.backgroundColor;
          ctx.stroke();
        }
      }
      ctx.restore();
    } else {
      const distance = Math.hypot(p.x - from.x, p.y - from.y),
        steps = Math.max(1, Math.ceil(distance / Math.max(1, e.brushSize / 5)));
      const radius = e.brushSize / 2, soft = this.hardness < 0.99 && !this.clone;
      const rgb = soft ? e.color.match(/[0-9a-f]{2}/gi)!.map((h) => parseInt(h, 16)).join(",") : "";
      for (let i = 1; i <= steps; i++) {
        const x = from.x + ((p.x - from.x) * i) / steps,
          y = from.y + ((p.y - from.y) * i) / steps;
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        if (this.clone && e.cloneOffset) {
          ctx.clip();
          ctx.drawImage(this.clone, e.cloneOffset.x, e.cloneOffset.y);
        } else if (soft) {
          const g = ctx.createRadialGradient(x, y, radius * this.hardness, x, y, radius);
          g.addColorStop(0, `rgba(${rgb},1)`);
          g.addColorStop(1, `rgba(${rgb},0)`);
          ctx.fillStyle = g;
          ctx.fill();
        } else {
          ctx.fillStyle = e.color;
          ctx.fill();
        }
        ctx.restore();
      }
    }
    // Miter joins reach beyond half the outline width at shape corners.
    const pad = this.tool === "line" && e.shape.kind !== "line" ? e.shape.width * 2 + 2 : e.brushSize / 2 + 2;
    const bounds = {
      left: Math.max(0, Math.floor(box.left - pad)),
      top: Math.max(0, Math.floor(box.top - pad)),
      right: Math.min(this.base.width, Math.ceil(box.right + pad)),
      bottom: Math.min(this.base.height, Math.ceil(box.bottom + pad)),
    };
    if (this.lineBounds) {
      const old = this.lineBounds;
      this.dirty = this.dirty ? {
        left: Math.min(this.dirty.left, old.left), top: Math.min(this.dirty.top, old.top),
        right: Math.max(this.dirty.right, old.right), bottom: Math.max(this.dirty.bottom, old.bottom),
      } : old;
    }
    if (editable) this.lineBounds = bounds;
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
  /** Redraws an editable shape between two (possibly moved) points; `angle` rotates rectangles and ellipses. */
  moveLine(a: Point, b: Point, angle = 0) {
    this.start = a;
    this.angle = angle;
    this.draw(b);
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
    x.globalAlpha = this.tool === "gradient" || this.tool === "text" || (this.tool === "line" && e.shape.kind !== "line") ? 1 : e.brushOpacity;
    x.globalCompositeOperation =
      this.tool === "eraser" ? "destination-out" : "source-over";
    draw(x, this.clipped);
    x.globalAlpha = 1;
    x.globalCompositeOperation = "source-over";
    e.emit(true, interactive, { x: left, y: top, width: w, height: h });
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
          : this.tool === "text"
            ? "Text"
          : this.tool === "gradient"
            ? this.editor.gradient === "radial" ? "Radial gradient" : "Linear gradient"
          : this.tool === "line"
            ? { line: "Line", rect: "Rectangle", ellipse: "Ellipse", polygon: "Polygon" }[this.editor.shape.kind]
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
