import type { Point } from "../types";
export type TransformHit = {
  action: "move" | "scale" | "rotate" | "distort";
  handle: number;
};
export const midpoint = (a: Point, b: Point): Point => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});
export function transformHandles(points: Point[]) {
  return [...points, ...points.map((p, i) => midpoint(p, points[(i + 1) % 4]))];
}
export function hitTransform(
  points: Point[],
  p: Point,
  zoom: number,
  free: boolean,
  ctrl = false,
): TransformHit {
  const handles = free ? transformHandles(points) : points;
  const handle = handles.findIndex(
    (q) => Math.hypot(q.x - p.x, q.y - p.y) <= 9 / zoom,
  );
  if (handle >= 0)
    return { action: free && (!ctrl || handle >= 4) ? "scale" : "distort", handle };
  if (free) {
    const crosses = points.map((a, i) => {
      const b = points[(i + 1) % points.length];
      return (b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);
    });
    const inside = crosses.every(v => v >= -1e-8) || crosses.every(v => v <= 1e-8);
    if (!inside)
      return { action: "rotate", handle: -1 };
  }
  return { action: "move", handle: -1 };
}
export function dragTransform(
  points: Point[],
  start: Point,
  p: Point,
  hit: TransformHit,
  shift: boolean,
  alt: boolean,
  ctrl = false,
): Point[] {
  const center = midpoint(points[0], points[2]);
  if (hit.action === "move") {
    const snap = (delta: number) => ctrl ? Math.round(delta / 10) * 10 : delta;
    const dx = snap(p.x - start.x), dy = snap(p.y - start.y);
    return points.map((q) => ({
      x: q.x + dx,
      y: q.y + dy,
    }));
  }
  if (hit.action === "distort")
    return points.map((q, i) =>
      i === hit.handle
        ? { x: q.x + p.x - start.x, y: q.y + p.y - start.y }
        : { ...q },
    );
  if (hit.action === "rotate") {
    let angle =
      Math.atan2(p.y - center.y, p.x - center.x) -
      Math.atan2(start.y - center.y, start.x - center.x);
    const step = ctrl ? Math.PI / 36 : shift ? Math.PI / 12 : 0;
    if (step) {
      const initial = Math.atan2(points[1].y - points[0].y, points[1].x - points[0].x);
      angle = Math.round((initial + angle) / step) * step - initial;
    }
    return points.map((q) => ({
      x:
        center.x +
        (q.x - center.x) * Math.cos(angle) -
        (q.y - center.y) * Math.sin(angle),
      y:
        center.y +
        (q.x - center.x) * Math.sin(angle) +
        (q.y - center.y) * Math.cos(angle),
    }));
  }
  const handles = transformHandles(points),
    h = hit.handle;
  const anchor = alt
    ? center
    : handles[h < 4 ? (h + 2) % 4 : 4 + ((h - 4 + 2) % 4)];
  // Resolve scaling along the transformed frame axes, including rotated frames.
  const u = { x: points[1].x - points[0].x, y: points[1].y - points[0].y };
  const v = { x: points[3].x - points[0].x, y: points[3].y - points[0].y };
  const det = u.x * v.y - u.y * v.x;
  if (Math.abs(det) < 1e-8) return points;
  const coordinates = (q: Point) => ({
    x: ((q.x - anchor.x) * v.y - (q.y - anchor.y) * v.x) / det,
    y: (u.x * (q.y - anchor.y) - u.y * (q.x - anchor.x)) / det,
  });
  const from = coordinates(start),
    to = coordinates(p);
  let sx = Math.abs(from.x) > 1e-8 ? to.x / from.x : 1,
    sy = Math.abs(from.y) > 1e-8 ? to.y / from.y : 1;
  if (h === 4 || h === 6) sx = 1;
  else if (h === 5 || h === 7) sy = 1;
  else if (!shift) {
    const a = { x: start.x - anchor.x, y: start.y - anchor.y },
      b = { x: p.x - anchor.x, y: p.y - anchor.y };
    sx = sy = (a.x * b.x + a.y * b.y) / (a.x * a.x + a.y * a.y);
  }
  if (ctrl) {
    const width = Math.hypot(u.x, u.y), height = Math.hypot(v.x, v.y);
    const snapSize = (factor: number, size: number) => {
      if (size < 1e-8) return factor;
      const dimension = factor * size;
      const snapped = Math.round(dimension / 10) * 10;
      return (snapped || (dimension < 0 ? -10 : 10)) / size;
    };
    if (h < 4 && !shift) {
      // Quantize the longer dimension and derive the other from the original
      // aspect ratio. This also works along a rotated frame's local axes.
      sx = sy = snapSize(sx, Math.max(width, height));
    } else {
      if (h !== 4 && h !== 6) sx = snapSize(sx, width);
      if (h !== 5 && h !== 7) sy = snapSize(sy, height);
    }
  }
  const safe = (n: number) =>
    Math.abs(n) < 0.001 ? (n < 0 ? -0.001 : 0.001) : n;
  sx = safe(sx);
  sy = safe(sy);
  return points.map((q) => {
    const c = coordinates(q);
    return {
      x: anchor.x + c.x * sx * u.x + c.y * sy * v.x,
      y: anchor.y + c.x * sx * u.y + c.y * sy * v.y,
    };
  });
}
