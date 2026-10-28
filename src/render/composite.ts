import type { TextureDocument } from "../types";
import { canvas, context, masked } from "../core/canvas";
export function composite(doc: TextureDocument, target?: HTMLCanvasElement) {
  const c =
    target && target.width === doc.width && target.height === doc.height
      ? target
      : canvas(doc.width, doc.height);
  const ctx = context(c);
  ctx.clearRect(0, 0, c.width, c.height);
  for (const l of doc.layers) {
    if (!l.visible) continue;
    ctx.globalAlpha = l.opacity;
    ctx.globalCompositeOperation = l.blend;
    ctx.drawImage(l.uvMask ? masked(l.canvas, l.uvMask) : l.canvas, 0, 0);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  return c;
}
