export function canvas(width: number, height: number, readFrequently = true): HTMLCanvasElement {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1
  )
    throw new Error("Texture dimensions must be positive whole numbers.");
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d", { willReadFrequently: readFrequently });
  if (!ctx || c.width !== width || c.height !== height)
    throw new Error(`Cannot allocate ${width} × ${height} canvas.`);
  // Render buffers stay GPU-backed. Documents are allocation-checked before
  // entering the render loop; reading back a probe here would force a GPU stall.
  if (!readFrequently) return c;
  try {
    ctx.fillStyle = "#fff";
    ctx.fillRect(width - 1, height - 1, 1, 1);
    if (ctx.getImageData(width - 1, height - 1, 1, 1).data[3] !== 255)
      throw new Error();
    ctx.clearRect(0, 0, width, height);
  } catch {
    throw new Error(
      `The system could not allocate ${width} × ${height} pixels. Try a smaller texture or free memory. No downscaling was applied.`,
    );
  }
  return c;
}
export const context = (c: HTMLCanvasElement) =>
  c.getContext("2d", { willReadFrequently: true })!;
export function cloneCanvas(source: HTMLCanvasElement) {
  const c = canvas(source.width, source.height);
  context(c).drawImage(source, 0, 0);
  return c;
}
export function masked(
  source: HTMLCanvasElement,
  mask: HTMLCanvasElement | null,
  invert = false,
  target?: HTMLCanvasElement,
) {
  const c = target ?? cloneCanvas(source);
  if (target) {
    const ctx = context(c);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(source, 0, 0);
  }
  if (mask) {
    const ctx = context(c);
    ctx.globalCompositeOperation = invert
      ? "destination-out"
      : "destination-in";
    ctx.drawImage(mask, 0, 0);
    ctx.globalCompositeOperation = "source-over";
  }
  return c;
}
export function alphaBounds(c: HTMLCanvasElement) {
  const { width: w, height: h } = c, ctx = context(c), strip = 64;
  // Reads strips inward from each edge and stops at the first content, instead of the whole image.
  const area = (x: number, y: number, width: number, height: number) => ctx.getImageData(x, y, width, height).data;
  let y0 = -1;
  for (let y = 0; y < h && y0 < 0; y += strip) {
    const d = area(0, y, w, Math.min(strip, h - y));
    for (let i = 3; i < d.length; i += 4) if (d[i]) { y0 = y + Math.floor((i >> 2) / w); break; }
  }
  if (y0 < 0) return null;
  let y1 = y0;
  for (let y = h; y > y0; y -= strip) {
    const top = Math.max(y0, y - strip), d = area(0, top, w, y - top);
    let found = -1;
    for (let i = d.length - 1; i > 0; i -= 4) if (d[i]) { found = top + Math.floor((i >> 2) / w); break; }
    if (found >= 0) { y1 = found; break; }
  }
  const height = y1 - y0 + 1;
  let x0 = -1;
  for (let x = 0; x < w && x0 < 0; x += strip) {
    const n = Math.min(strip, w - x), d = area(x, y0, n, height);
    for (let i = 3; i < d.length; i += 4) if (d[i]) { const col = x + ((i >> 2) % n); if (x0 < 0 || col < x0) x0 = col; }
  }
  let x1 = x0;
  for (let x = w; x > x0; x -= strip) {
    const left = Math.max(x0, x - strip), n = x - left, d = area(left, y0, n, height);
    let found = -1;
    for (let i = 3; i < d.length; i += 4) if (d[i]) found = Math.max(found, left + ((i >> 2) % n));
    if (found >= 0) { x1 = found; break; }
  }
  return { x: x0, y: y0, width: x1 - x0 + 1, height };
}
export function toPNG(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    c.toBlob(
      (b) =>
        b
          ? resolve(b)
          : reject(
              new Error(
                "PNG encoding failed; the canvas may exceed available memory.",
              ),
            ),
      "image/png",
    ),
  );
}
