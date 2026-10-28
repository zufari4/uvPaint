export function canvas(width: number, height: number): HTMLCanvasElement {
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
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx || c.width !== width || c.height !== height)
    throw new Error(`Cannot allocate ${width} × ${height} canvas.`);
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
) {
  const c = cloneCanvas(source);
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
  const { width: w, height: h } = c;
  const d = context(c).getImageData(0, 0, w, h).data;
  let x0 = w,
    y0 = h,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (d[(y * w + x) * 4 + 3]) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
  return x1 < 0
    ? null
    : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
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
