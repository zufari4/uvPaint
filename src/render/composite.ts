import type { TextureDocument } from "../types";
import { canvas, context, masked } from "../core/canvas";
const maskBuffers = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();
export function composite(doc: TextureDocument, target?: HTMLCanvasElement) {
  const c =
    target && target.width === doc.width && target.height === doc.height
      ? target
      : canvas(doc.width, doc.height, false);
  const ctx = context(c);
  ctx.clearRect(0, 0, c.width, c.height);
  for (const l of doc.layers) {
    if (!l.visible) continue;
    ctx.globalAlpha = l.opacity;
    ctx.globalCompositeOperation = l.blend;
    let image = l.canvas;
    if (l.uvMask) {
      let buffer = maskBuffers.get(c);
      if (!buffer || buffer.width !== c.width || buffer.height !== c.height) {
        buffer = canvas(c.width, c.height, false);
        maskBuffers.set(c, buffer);
      }
      image = masked(l.canvas, l.uvMask, false, buffer);
    }
    ctx.drawImage(image, 0, 0);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  return c;
}
