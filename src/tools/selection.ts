import type { Point, SelectionMode } from "../types";
import { canvas, context, cloneCanvas } from "../core/canvas";
export function polygonMask(w: number, h: number, points: Point[]) {
  const c = canvas(w, h);
  if (points.length < 3) return c;
  const x = context(c);
  x.fillStyle = "#fff";
  x.beginPath();
  points.forEach((p, i) => (i ? x.lineTo(p.x, p.y) : x.moveTo(p.x, p.y)));
  x.closePath();
  x.fill();
  return c;
}
export function combineSelection(
  old: HTMLCanvasElement | null,
  next: HTMLCanvasElement,
  mode: SelectionMode,
) {
  if (!old || mode === "replace") return next;
  const c = cloneCanvas(old);
  const x = context(c);
  x.globalCompositeOperation =
    mode === "add" ? "source-over" : "destination-out";
  x.drawImage(next, 0, 0);
  return c;
}
export function invertSelection(
  old: HTMLCanvasElement | null,
  w: number,
  h: number,
) {
  const c = canvas(w, h);
  const x = context(c);
  x.fillStyle = "#fff";
  x.fillRect(0, 0, w, h);
  if (old) {
    x.globalCompositeOperation = "destination-out";
    x.drawImage(old, 0, 0);
  }
  return c;
}
export function floodMask(
  source: HTMLCanvasElement,
  px: number,
  py: number,
  tolerance: number,
  contiguous: boolean,
) {
  const { width: w, height: h } = source;
  const out = canvas(w, h);
  px = Math.floor(px);
  py = Math.floor(py);
  if (px < 0 || py < 0 || px >= w || py >= h) return out;
  const data = context(source).getImageData(0, 0, w, h).data;
  const image = context(out).createImageData(w, h);
  const dst = image.data;
  const seed = (py * w + px) * 4;
  const a = data[seed + 3];
  const limit = Math.max(0, tolerance);
  const matches = (i: number) => {
    const j = i * 4;
    return (
      Math.abs(data[j + 3] - a) <= limit &&
      (a === 0 ||
        Math.max(
          Math.abs(data[j] - data[seed]),
          Math.abs(data[j + 1] - data[seed + 1]),
          Math.abs(data[j + 2] - data[seed + 2]),
        ) <= limit)
    );
  };
  const mark = (i: number) => {
    dst[i * 4] = dst[i * 4 + 1] = dst[i * 4 + 2] = dst[i * 4 + 3] = 255;
  };
  if (!contiguous) {
    for (let i = 0; i < w * h; i++) if (matches(i)) mark(i);
  } else {
    const visited = new Uint8Array(w * h);
    const queue = new Int32Array(w * h);
    let head = 0,
      tail = 0;
    queue[tail++] = py * w + px;
    visited[py * w + px] = 1;
    while (head < tail) {
      const i = queue[head++];
      if (!matches(i)) continue;
      mark(i);
      const x = i % w;
      const neighbors = [
        x > 0 ? i - 1 : -1,
        x < w - 1 ? i + 1 : -1,
        i >= w ? i - w : -1,
        i < w * (h - 1) ? i + w : -1,
      ];
      for (const n of neighbors)
        if (n >= 0 && !visited[n]) {
          visited[n] = 1;
          queue[tail++] = n;
        }
    }
  }
  context(out).putImageData(image, 0, 0);
  return out;
}
