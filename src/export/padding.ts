import type { Island } from "../types";
import { canvas, context } from "../core/canvas";
import { traceIslands } from "../tools/uv";

/**
 * Extends island edge colors outward by half of the smallest gap between islands,
 * so mip-mapping and filtering never pull in unrelated texels.
 * `inside` marks UV-covered pixels; `pixels` (RGBA) is edited in place.
 */
export function dilateIslands(pixels: Uint8ClampedArray, inside: Uint8Array, width: number, height: number, maxRadius = 32) {
  const count = width * height, label = new Int32Array(count), stack = new Int32Array(count);
  let labels = 0;
  for (let start = 0; start < count; start++) {
    if (!inside[start] || label[start]) continue;
    label[start] = ++labels;
    let top = 0;
    stack[top++] = start;
    while (top) {
      const p = stack[--top], x = p % width, y = (p - x) / width;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const q = ny * width + nx;
          if (inside[q] && !label[q]) { label[q] = labels; stack[top++] = q; }
        }
    }
  }
  if (!labels) return { padding: null, radius: 0 };
  // Breadth-first propagation of the nearest island pixel; fronts of different islands meet halfway across each gap.
  const seed = new Int32Array(count).fill(-1), queue = stack;
  let head = 0, tail = 0;
  for (let p = 0; p < count; p++) if (inside[p]) { seed[p] = p; queue[tail++] = p; }
  const distance = (a: number, b: number) => Math.hypot((a % width) - (b % width), Math.floor(a / width) - Math.floor(b / width));
  const reach = maxRadius + 1;
  let gap = Infinity;
  while (head < tail) {
    const p = queue[head++], s = seed[p], x = p % width, y = (p - x) / width;
    const sx = s % width, sy = (s - sx) / width;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const q = ny * width + nx, other = seed[q];
        if (other >= 0) {
          if (label[other] !== label[s]) gap = Math.min(gap, distance(s, other) - 1);
          continue;
        }
        if (Math.max(Math.abs(nx - sx), Math.abs(ny - sy)) > reach) continue;
        seed[q] = s;
        queue[tail++] = q;
      }
  }
  const padding = Number.isFinite(gap) ? Math.max(0, Math.round(gap)) : null;
  const radius = padding === null ? maxRadius : Math.min(maxRadius, Math.floor(padding / 2));
  if (!radius) return { padding, radius };
  for (let q = 0; q < count; q++) {
    const s = seed[q];
    if (inside[q] || s < 0 || distance(q, s) > radius + 0.5) continue;
    pixels[q * 4] = pixels[s * 4];
    pixels[q * 4 + 1] = pixels[s * 4 + 1];
    pixels[q * 4 + 2] = pixels[s * 4 + 2];
    pixels[q * 4 + 3] = pixels[s * 4 + 3];
  }
  return { padding, radius };
}

export function padTexture(texture: HTMLCanvasElement, islands: Island[]) {
  const { width, height } = texture;
  if (!islands.length) return { canvas: texture, padding: null, radius: 0 };
  const mask = canvas(width, height), ctx = context(mask);
  ctx.fillStyle = "#fff";
  traceIslands(ctx, islands, width, height);
  ctx.fill();
  const coverage = ctx.getImageData(0, 0, width, height).data, inside = new Uint8Array(width * height);
  // Half-covered edge texels belong to the island; the rest is padding.
  for (let i = 0; i < inside.length; i++) inside[i] = coverage[i * 4 + 3] >= 128 ? 1 : 0;
  const image = context(texture).getImageData(0, 0, width, height);
  const result = dilateIslands(image.data, inside, width, height);
  if (!result.radius) return { canvas: texture, ...result };
  const out = canvas(width, height);
  context(out).putImageData(image, 0, 0);
  return { canvas: out, ...result };
}
