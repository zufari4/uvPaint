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

export type Region = { x: number; y: number; width: number; height: number };

/**
 * Live preview compositing for many layers: the layers below and above the active one are
 * cached as two images, so edits to the active layer redraw three images instead of every layer.
 * A region (e.g. the area touched by a brush frame) limits the redraw to that rectangle.
 */
export class LayerCompositor {
  private below: Group | null = null;
  private above: Group | null = null;
  private last: { target: HTMLCanvasElement; activeId: string } | null = null;
  render(doc: TextureDocument, target?: HTMLCanvasElement, region?: Region) {
    const index = doc.layers.findIndex((l) => l.id === doc.activeId);
    const above = doc.layers.slice(index + 1);
    // "source-over" is associative; other blend modes above the active layer need the full pass.
    if (index < 0 || doc.layers.length < 3 || above.some((l) => l.visible && l.blend !== "source-over")) {
      this.last = null;
      return composite(doc, target);
    }
    const c = target && target.width === doc.width && target.height === doc.height ? target : canvas(doc.width, doc.height, false);
    const below = this.group("below", doc, doc.layers.slice(0, index));
    const top = this.group("above", doc, above);
    const active = doc.layers[index];
    // A partial redraw is only valid on top of a full one with the same layer groups.
    const area = region && !below.rebuilt && !top.rebuilt && this.last?.target === c && this.last.activeId === active.id ? region : undefined;
    this.last = { target: c, activeId: active.id };
    const ctx = context(c);
    ctx.save();
    if (area) { ctx.beginPath(); ctx.rect(area.x, area.y, area.width, area.height); ctx.clip(); }
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(below.image, 0, 0);
    if (active.visible) {
      ctx.globalAlpha = active.opacity;
      ctx.globalCompositeOperation = active.blend;
      ctx.drawImage(layerImage(active, c, area), 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
    ctx.drawImage(top.image, 0, 0);
    ctx.restore();
    return c;
  }
  /** Builds the cached groups ahead of time, so the first brush frame on a newly selected layer does not stall. */
  prepare(doc: TextureDocument) {
    const index = doc.layers.findIndex((l) => l.id === doc.activeId);
    const above = doc.layers.slice(index + 1);
    if (index < 0 || doc.layers.length < 3 || above.some((l) => l.visible && l.blend !== "source-over")) return;
    this.group("below", doc, doc.layers.slice(0, index));
    this.group("above", doc, above);
  }
  private group(which: "below" | "above", doc: TextureDocument, layers: Layer[]) {
    const key = groupKey(layers), cached = this[which];
    const fits = !!cached && cached.image.width === doc.width && cached.image.height === doc.height;
    if (cached && fits && sameKey(cached.key, key)) return { image: cached.image, rebuilt: false };
    const image = composite({ ...doc, layers }, cached && fits ? cached.image : undefined);
    this[which] = { key, image };
    return { image, rebuilt: true };
  }
}

function layerImage(layer: Layer, target: HTMLCanvasElement, area?: Region) {
  if (!layer.uvMask) return layer.canvas;
  let buffer = maskBuffers.get(target);
  if (!buffer || buffer.width !== target.width || buffer.height !== target.height) {
    buffer = canvas(target.width, target.height, false);
    maskBuffers.set(target, buffer);
    area = undefined;
  }
  const b = context(buffer);
  b.save();
  if (area) { b.beginPath(); b.rect(area.x, area.y, area.width, area.height); b.clip(); }
  b.clearRect(0, 0, buffer.width, buffer.height);
  b.drawImage(layer.canvas, 0, 0);
  b.globalCompositeOperation = "destination-in";
  b.drawImage(layer.uvMask, 0, 0);
  b.restore();
  return buffer;
}
