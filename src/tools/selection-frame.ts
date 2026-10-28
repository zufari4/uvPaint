import type { Point } from "../types";
import { alphaBounds, canvas, context } from "../core/canvas";

export type SelectionBounds = { x: number; y: number; width: number; height: number };
const boundsCache = new WeakMap<HTMLCanvasElement, SelectionBounds | null>();
export function selectionBounds(mask: HTMLCanvasElement): SelectionBounds | null {
  if (!boundsCache.has(mask)) boundsCache.set(mask, alphaBounds(mask));
  return boundsCache.get(mask)!;
}
export function selectionHandles(b: SelectionBounds): Point[] {
  const { x, y, width: w, height: h } = b;
  return [
    { x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h },
    { x: x + w / 2, y }, { x: x + w, y: y + h / 2 },
    { x: x + w / 2, y: y + h }, { x, y: y + h / 2 },
    { x: x + w / 2, y: y + h / 2 },
  ];
}
export const selectionCursors = ["nwse-resize", "nesw-resize", "nwse-resize", "nesw-resize", "ns-resize", "ew-resize", "ns-resize", "ew-resize", "move"];
export function hitSelectionHandle(b: SelectionBounds, p: Point, zoom: number) {
  let index = -1, distance = 8 / zoom;
  selectionHandles(b).forEach((h, i) => {
    const d = Math.hypot(h.x - p.x, h.y - p.y);
    if (d <= distance) { distance = d; index = i; }
  });
  return index;
}
export function dragSelectionBounds(b: SelectionBounds, handle: number, start: Point, p: Point): SelectionBounds {
  const dx = Math.round(p.x - start.x), dy = Math.round(p.y - start.y);
  if (handle === 8) return { ...b, x: b.x + dx, y: b.y + dy };
  let left = b.x, top = b.y, right = b.x + b.width, bottom = b.y + b.height;
  if ([0, 3, 7].includes(handle)) left = Math.min(right - 1, left + dx);
  if ([1, 2, 5].includes(handle)) right = Math.max(left + 1, right + dx);
  if ([0, 1, 4].includes(handle)) top = Math.min(bottom - 1, top + dy);
  if ([2, 3, 6].includes(handle)) bottom = Math.max(top + 1, bottom + dy);
  return { x: left, y: top, width: right - left, height: bottom - top };
}
export function transformSelection(mask: HTMLCanvasElement, from: SelectionBounds, to: SelectionBounds) {
  const out = canvas(mask.width, mask.height), ctx = context(out);
  ctx.drawImage(mask, from.x, from.y, from.width, from.height, to.x, to.y, to.width, to.height);
  return out;
}
