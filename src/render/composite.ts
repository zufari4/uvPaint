import type { Layer, TextureDocument } from "../types";
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

type Group = { key: unknown[]; image: HTMLCanvasElement };
const groupKey = (layers: Layer[]) => layers.flatMap((l) => [l.canvas, l.uvMask ?? null, l.visible, l.opacity, l.blend]);
const sameKey = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * Live preview compositing for many layers: the layers below and above the active one are
 * cached as two images, so edits to the active layer redraw three images instead of every layer.
 */
export class LayerCompositor {
  private below: Group | null = null;
  private above: Group | null = null;
  render(doc: TextureDocument, target?: HTMLCanvasElement) {
    const index = doc.layers.findIndex((l) => l.id === doc.activeId);
    const above = doc.layers.slice(index + 1);
    // "source-over" is associative; other blend modes above the active layer need the full pass.
    if (index < 0 || doc.layers.length < 3 || above.some((l) => l.visible && l.blend !== "source-over"))
      return composite(doc, target);
    const c = target && target.width === doc.width && target.height === doc.height ? target : canvas(doc.width, doc.height, false);
    const below = this.group("below", doc, doc.layers.slice(0, index));
    const top = this.group("above", doc, above);
    const ctx = context(c);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(below, 0, 0);
    const active = doc.layers[index];
    if (active.visible) {
      let image = active.canvas;
      if (active.uvMask) {
        let buffer = maskBuffers.get(c);
        if (!buffer || buffer.width !== c.width || buffer.height !== c.height) {
          buffer = canvas(c.width, c.height, false);
          maskBuffers.set(c, buffer);
        }
        image = masked(active.canvas, active.uvMask, false, buffer);
      }
      ctx.globalAlpha = active.opacity;
      ctx.globalCompositeOperation = active.blend;
      ctx.drawImage(image, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
    ctx.drawImage(top, 0, 0);
    return c;
  }
  private group(which: "below" | "above", doc: TextureDocument, layers: Layer[]) {
    const key = groupKey(layers), cached = this[which];
    const fits = !!cached && cached.image.width === doc.width && cached.image.height === doc.height;
    if (cached && fits && sameKey(cached.key, key)) return cached.image;
    const image = composite({ ...doc, layers }, cached && fits ? cached.image : undefined);
    this[which] = { key, image };
    return image;
  }
}
