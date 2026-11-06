import type { Point, ShapeKind } from "../types";

export const rotateAround = (p: Point, c: Point, angle: number): Point => {
  const cos = Math.cos(angle), sin = Math.sin(angle), dx = p.x - c.x, dy = p.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
};
/** Rectangle/ellipse frame: `a` and `b` are opposite corners in texture space, `angle` rotates the frame about its centre. */
export function shapeFrame(a: Point, b: Point, angle: number) {
  const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const la = rotateAround(a, center, -angle), lb = rotateAround(b, center, -angle);
  const halfWidth = Math.abs(lb.x - la.x) / 2, halfHeight = Math.abs(lb.y - la.y) / 2;
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) =>
    rotateAround({ x: center.x + sx * halfWidth, y: center.y + sy * halfHeight }, center, angle));
  return { center, halfWidth, halfHeight, corners };
}
/** The point a shape rotates about: the polygon centre or the middle of the two points. */
export const shapePivot = (kind: ShapeKind, a: Point, b: Point): Point =>
  kind === "polygon" ? a : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
/**
 * Finds what lies under `p`: the shape body (drag moves it) or a ring just outside it (drag rotates it).
 * `slack` widens the body and `ring` sets the rotation zone, both in texture pixels.
 */
export function hitShape(kind: ShapeKind, a: Point, b: Point, angle: number, p: Point, slack: number, ring: number): "body" | "rotate" | null {
  if (kind === "line") {
    const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
    const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length)) : 0;
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy) <= slack ? "body" : null;
  }
  if (kind === "polygon") {
    const r = Math.hypot(b.x - a.x, b.y - a.y), d = Math.hypot(p.x - a.x, p.y - a.y);
    return d <= r + slack ? "body" : d <= r + ring ? "rotate" : null;
  }
  const { center, halfWidth, halfHeight } = shapeFrame(a, b, angle);
  const q = rotateAround(p, center, -angle), x = Math.abs(q.x - center.x), y = Math.abs(q.y - center.y);
  const w = halfWidth + slack, h = halfHeight + slack;
  const inside = kind === "ellipse" ? (x / w) ** 2 + (y / h) ** 2 <= 1 : x <= w && y <= h;
  if (inside) return "body";
  return x <= halfWidth + ring && y <= halfHeight + ring ? "rotate" : null;
}
