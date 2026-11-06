import { canvas, context, masked } from "../core/canvas";

export type PixelateOptions = {
  /** Texture pixels per output pixel. */
  pixelSize: number;
  /** 0 keeps the block majority, 1 favours small features that contrast with their surroundings. */
  detail: number;
  /** How readily a block with two distinct colors is treated as an edge instead of being averaged. */
  edges: number;
  /** Darkening of the dark side of strong edges and silhouettes. */
  outline: number;
  /** Levels per channel; 32 matches the PS1 15-bit color. */
  colors: number;
  /** Strength of the ordered 4×4 dither used by the PS1 GPU. */
  dither: number;
};

export const defaultPixelateOptions: PixelateOptions = {
  pixelSize: 4,
  detail: 0.6,
  edges: 0.6,
  outline: 0.2,
  colors: 32,
  dither: 0.35,
};

const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const colorRange = 255 * Math.sqrt(3);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function smartPixelate(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  o: PixelateOptions,
  weight?: Uint8ClampedArray,
) {
  const size = Math.max(1, Math.round(o.pixelSize));
  const gw = Math.ceil(width / size), gh = Math.ceil(height / size), cells = gw * gh;
  const detail = clamp01(o.detail), threshold = 0.03 + (1 - clamp01(o.edges)) * 0.45;
  const minShare = Math.min(0.25, 1.5 / (size * size)), alphaCut = 0.5 - 0.4 * detail;
  const mean = new Float32Array(cells * 3), cover = new Float32Array(cells), opacity = new Float32Array(cells);
  const skip = new Uint8Array(cells);
  // Block pixels as r, g, b, effective alpha.
  const block = new Float32Array(size * size * 4);
  const gather = (gx: number, gy: number) => {
    const x0 = gx * size, y0 = gy * size, x1 = Math.min(width, x0 + size), y1 = Math.min(height, y0 + size);
    let n = 0, k = 0, kn = 0;
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const i = y * width + x, p = i * 4, w = weight ? weight[i] / 255 : 1;
        k += w;
        if (src[p + 3]) kn += w;
        block[n++] = src[p];
        block[n++] = src[p + 1];
        block[n++] = src[p + 2];
        block[n++] = (w * src[p + 3]) / 255;
      }
    return { n, k, kn };
  };

  for (let gy = 0; gy < gh; gy++)
    for (let gx = 0; gx < gw; gx++) {
      const cell = gy * gw + gx, { n, k, kn } = gather(gx, gy);
      if (!k) { skip[cell] = 1; continue; }
      let ka = 0, r = 0, g = 0, b = 0;
      for (let i = 0; i < n; i += 4) {
        const a = block[i + 3];
        ka += a; r += block[i] * a; g += block[i + 1] * a; b += block[i + 2] * a;
      }
      cover[cell] = ka / k;
      opacity[cell] = kn ? ka / kn : 0;
      if (ka) { mean[cell * 3] = r / ka; mean[cell * 3 + 1] = g / ka; mean[cell * 3 + 2] = b / ka; }
    }

  const color = new Float32Array(cells * 3), alpha = new Float32Array(cells);
  for (let gy = 0; gy < gh; gy++)
    for (let gx = 0; gx < gw; gx++) {
      const cell = gy * gw + gx;
      if (skip[cell] || cover[cell] < alphaCut || !cover[cell]) continue;
      alpha[cell] = opacity[cell] * 255;
      const mr = mean[cell * 3], mg = mean[cell * 3 + 1], mb = mean[cell * 3 + 2];
      color[cell * 3] = mr; color[cell * 3 + 1] = mg; color[cell * 3 + 2] = mb;
      const { n } = gather(gx, gy);
      // Two-means split seeded with the most extreme pixels.
      let best = -1, ar = mr, ag = mg, ab = mb;
      for (let i = 0; i < n; i += 4) {
        if (!block[i + 3]) continue;
        const d = (block[i] - mr) ** 2 + (block[i + 1] - mg) ** 2 + (block[i + 2] - mb) ** 2;
        if (d > best) { best = d; ar = block[i]; ag = block[i + 1]; ab = block[i + 2]; }
      }
      let br = ar, bg = ag, bb = ab;
      best = -1;
      for (let i = 0; i < n; i += 4) {
        if (!block[i + 3]) continue;
        const d = (block[i] - ar) ** 2 + (block[i + 1] - ag) ** 2 + (block[i + 2] - ab) ** 2;
        if (d > best) { best = d; br = block[i]; bg = block[i + 1]; bb = block[i + 2]; }
      }
      if (Math.sqrt(best) / colorRange < threshold) continue;
      let wa = 0, wb = 0;
      for (let iteration = 0; iteration < 3; iteration++) {
        let sar = 0, sag = 0, sab = 0, sbr = 0, sbg = 0, sbb = 0;
        wa = 0; wb = 0;
        for (let i = 0; i < n; i += 4) {
          const a = block[i + 3];
          if (!a) continue;
          const r = block[i], g = block[i + 1], b = block[i + 2];
          const da = (r - ar) ** 2 + (g - ag) ** 2 + (b - ab) ** 2;
          const db = (r - br) ** 2 + (g - bg) ** 2 + (b - bb) ** 2;
          if (da <= db) { wa += a; sar += r * a; sag += g * a; sab += b * a; }
          else { wb += a; sbr += r * a; sbg += g * a; sbb += b * a; }
        }
        if (!wa || !wb) break;
        ar = sar / wa; ag = sag / wa; ab = sab / wa;
        br = sbr / wb; bg = sbg / wb; bb = sbb / wb;
      }
      if (!wa || !wb) continue;
      const spread = Math.sqrt((ar - br) ** 2 + (ag - bg) ** 2 + (ab - bb) ** 2) / colorRange;
      if (spread < threshold) continue;
      // Surrounding blocks tell which side of the split is the distinctive feature.
      let cr = 0, cg = 0, cb = 0, cw = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const x = gx + dx, y = gy + dy;
          if ((!dx && !dy) || x < 0 || y < 0 || x >= gw || y >= gh) continue;
          const nb = y * gw + x, w = skip[nb] ? 0 : cover[nb];
          cw += w; cr += mean[nb * 3] * w; cg += mean[nb * 3 + 1] * w; cb += mean[nb * 3 + 2] * w;
        }
      if (cw) { cr /= cw; cg /= cw; cb /= cw; } else { cr = mr; cg = mg; cb = mb; }
      const sa = Math.sqrt((ar - cr) ** 2 + (ag - cg) ** 2 + (ab - cb) ** 2);
      const sb = Math.sqrt((br - cr) ** 2 + (bg - cg) ** 2 + (bb - cb) ** 2);
      const score = (share: number, salience: number) =>
        share < minShare ? -1 : (1 - detail) * share + (detail * salience) / (sa + sb + 1e-6);
      const pickA = score(wa / (wa + wb), sa) >= score(wb / (wa + wb), sb);
      color[cell * 3] = pickA ? ar : br;
      color[cell * 3 + 1] = pickA ? ag : bg;
      color[cell * 3 + 2] = pickA ? ab : bb;
    }

  if (o.outline > 0) {
    const lum = new Float32Array(cells), source = color.slice();
    for (let c = 0; c < cells; c++) lum[c] = 0.299 * source[c * 3] + 0.587 * source[c * 3 + 1] + 0.114 * source[c * 3 + 2];
    const lumThreshold = Math.max(12, threshold * 255), factor = 1 - 0.6 * clamp01(o.outline);
    for (let gy = 0; gy < gh; gy++)
      for (let gx = 0; gx < gw; gx++) {
        const cell = gy * gw + gx;
        if (!alpha[cell]) continue;
        let edge = false;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const x = gx + dx, y = gy + dy;
          if (x < 0 || y < 0 || x >= gw || y >= gh) continue;
          const nb = y * gw + x;
          if (skip[nb]) continue;
          if (!alpha[nb] || lum[nb] - lum[cell] > lumThreshold) { edge = true; break; }
        }
        if (edge) for (let ch = 0; ch < 3; ch++) color[cell * 3 + ch] = source[cell * 3 + ch] * factor;
      }
  }

  const levels = Math.max(2, Math.min(256, Math.round(o.colors))), step = 255 / (levels - 1), dither = clamp01(o.dither);
  const out = new Uint8ClampedArray(src.length);
  for (let gy = 0; gy < gh; gy++)
    for (let gx = 0; gx < gw; gx++) {
      const cell = gy * gw + gx, x0 = gx * size, y0 = gy * size;
      const x1 = Math.min(width, x0 + size), y1 = Math.min(height, y0 + size);
      if (skip[cell]) {
        for (let y = y0; y < y1; y++) out.set(src.subarray((y * width + x0) * 4, (y * width + x1) * 4), (y * width + x0) * 4);
        continue;
      }
      const offset = ((bayer[(gy & 3) * 4 + (gx & 3)] + 0.5) / 16 - 0.5) * dither * step;
      const a = Math.round(alpha[cell]);
      const r = a ? Math.round((color[cell * 3] + offset) / step) * step : 0;
      const g = a ? Math.round((color[cell * 3 + 1] + offset) / step) * step : 0;
      const b = a ? Math.round((color[cell * 3 + 2] + offset) / step) * step : 0;
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          const p = (y * width + x) * 4;
          out[p] = r; out[p + 1] = g; out[p + 2] = b; out[p + 3] = a;
        }
    }
  return out;
}

export type PixelateSource = {
  data: Uint8ClampedArray<ArrayBuffer>;
  width: number;
  height: number;
  weight?: Uint8ClampedArray<ArrayBuffer>;
};

/** One source per distinct pixel buffer; duplicated layers share theirs. */
export function pixelateSources(
  layers: { canvas: HTMLCanvasElement; uvMask?: HTMLCanvasElement | null }[],
  selection: HTMLCanvasElement | null,
) {
  const groups = new Map<HTMLCanvasElement, (HTMLCanvasElement | null)[]>();
  for (const l of layers) groups.set(l.canvas, [...(groups.get(l.canvas) ?? []), l.uvMask ?? null]);
  return [...groups].map(([layer, masks]) => {
    const { width, height } = layer;
    const data = context(layer).getImageData(0, 0, width, height).data;
    // Hidden pixels outside the islands or selection must not tint the visible blocks.
    let area: HTMLCanvasElement | null = null;
    if (!masks.includes(null)) {
      area = canvas(width, height);
      for (const mask of masks) context(area).drawImage(mask!, 0, 0);
    }
    if (selection) area = area ? masked(area, selection) : selection;
    let weight: Uint8ClampedArray<ArrayBuffer> | undefined;
    if (area) {
      const mask = context(area).getImageData(0, 0, width, height).data;
      weight = new Uint8ClampedArray(width * height);
      for (let i = 0; i < weight.length; i++) weight[i] = mask[i * 4 + 3];
    }
    return { layer, source: { data, width, height, weight } satisfies PixelateSource };
  });
}

export function pixelatedCanvas(layer: HTMLCanvasElement, data: Uint8ClampedArray<ArrayBuffer>, selection: HTMLCanvasElement | null) {
  const result = canvas(layer.width, layer.height);
  context(result).putImageData(new ImageData(data, layer.width, layer.height), 0, 0);
  if (!selection) return result;
  const merged = masked(layer, selection, true);
  context(merged).drawImage(masked(result, selection), 0, 0);
  return merged;
}
