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
    const removed = doc.islands.map(island => ({ ...island,
      triangles: island.triangles.filter((_, i) => island.faces?.[i] && hidden.has(faceKey(island.faces[i]))),
    })).filter(island => island.triangles.length);
    this.mask = null;
    if (!removed.length && !isolated) { this.buffer = null; return; }
    this.mask = canvas(doc.width, doc.height, false);
    const ctx = context(this.mask);
    ctx.fillStyle = "#fff";
    if (isolated) {
      // Keep only the focused faces. Subtracting other triangles leaves their
      // antialiased texture fringes outside the triangle boundaries.
      traceIslands(ctx, visible, doc.width, doc.height);ctx.fill();
    } else {
      traceIslands(ctx, removed, doc.width, doc.height); ctx.fill();
      ctx.strokeStyle = "#fff";ctx.lineWidth = 2;ctx.lineJoin = "round";ctx.stroke();
      // Overlapping UV pixels still belong to visible faces. Keep their image.
      ctx.globalCompositeOperation = "destination-out";
      traceIslands(ctx, visible, doc.width, doc.height); ctx.fill();
    }
    if (!this.buffer || this.buffer.width !== doc.width || this.buffer.height !== doc.height)
      this.buffer = canvas(doc.width, doc.height, false);
    this.rebuilds++;
  }
  render(source: HTMLCanvasElement | null, outside?: HTMLCanvasElement, opacity = 0): HTMLCanvasElement | null {
    if (!this.mask || !this.buffer) return null;
    const ctx = context(this.buffer);
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, this.width, this.height);
    if (source) ctx.drawImage(source, 0, 0);
    if (outside && opacity) { ctx.globalAlpha = opacity; ctx.drawImage(outside, 0, 0); }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = this.isolated ? "destination-in" : "destination-out";
    ctx.drawImage(this.mask, 0, 0); ctx.globalCompositeOperation = "source-over";
    return this.buffer;
  }
}
