import type { Island, TextureDocument } from "../types";
import { canvas, context } from "../core/canvas";
import { traceIslands } from "../tools/uv";
import { faceKey } from "../tools/uv-guides";

/** A view-only mask. Never use this buffer for editing, history or export. */
export class TextureVisibility {
  private islands: Island[] | null = null;
  private hidden: Set<string> | null = null;
  private width = 0;
  private height = 0;
  private isolated = false;
  private mask: HTMLCanvasElement | null = null;
  private buffer: HTMLCanvasElement | null = null;
  rebuilds = 0;
  update(doc: TextureDocument, hidden: Set<string>, visible: Island[], isolated = false) {
    if (this.islands === doc.islands && this.hidden === hidden && this.width === doc.width && this.height === doc.height && this.isolated === isolated) return;
    this.isolated = isolated;
    this.islands = doc.islands; this.hidden = hidden; this.width = doc.width; this.height = doc.height;
    const hasHiddenFaces = doc.islands.some(island => island.faces?.some(face => hidden.has(faceKey(face))));
    this.mask = null;
    if (!hasHiddenFaces && !isolated) { this.buffer = null; return; }
    this.mask = canvas(doc.width, doc.height, false);
    const ctx = context(this.mask);
    ctx.fillStyle = "#fff";
    // Both manual hiding and layer focus keep only visible UV faces. A mask
    // of removed faces leaks texture padding and transformed pixels into UV
    // gaps. The visible union also preserves shared pixels of overlapping UVs.
    traceIslands(ctx, visible, doc.width, doc.height);ctx.fill();
    this.rebuilds++;
  }
  render(source: HTMLCanvasElement | null, outside?: HTMLCanvasElement, opacity = 0): HTMLCanvasElement | null {
    if (!this.mask) return null;
    if (!this.buffer || this.buffer.width !== this.width || this.buffer.height !== this.height)
      this.buffer = canvas(this.width, this.height, false);
    const ctx = context(this.buffer);
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, this.width, this.height);
    if (source) ctx.drawImage(source, 0, 0);
    if (outside && opacity) { ctx.globalAlpha = opacity; ctx.drawImage(outside, 0, 0); }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(this.mask, 0, 0); ctx.globalCompositeOperation = "source-over";
    return this.buffer;
  }
  get active() { return !!this.mask; }
  /** Same as render(), but draws into a caller's (screen-sized) context using its current transform. */
  renderTo(ctx: CanvasRenderingContext2D, source: HTMLCanvasElement | null, outside?: HTMLCanvasElement, opacity = 0) {
    if (!this.mask) return false;
    if (source) ctx.drawImage(source, 0, 0);
    if (outside && opacity) { ctx.globalAlpha = opacity; ctx.drawImage(outside, 0, 0); ctx.globalAlpha = 1; }
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(this.mask, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    return true;
  }
}
