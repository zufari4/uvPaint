import { describe, it, expect } from "vitest";
import { smartPixelate, defaultPixelateOptions, type PixelateOptions } from "../src/tools/pixelate";

const image = (w: number, h: number, paint: (x: number, y: number) => [number, number, number, number]) => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) data.set(paint(x, y), (y * w + x) * 4);
  return data;
};
const at = (data: Uint8ClampedArray, w: number, x: number, y: number) => [...data.slice((y * w + x) * 4, (y * w + x) * 4 + 4)];
const plain: PixelateOptions = { ...defaultPixelateOptions, pixelSize: 8, outline: 0, dither: 0, colors: 256 };

describe("Smart pixelate", () => {
  it("fills each block with one flat color", () => {
    const src = image(16, 16, (x, y) => [x * 16, y * 16, 100, 255]);
    const out = smartPixelate(src, 16, 16, plain);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) expect(at(out, 16, x, y)).toEqual(at(out, 16, 0, 0));
  });
  it("keeps a thin contrasting line that plain averaging would wash out", () => {
    const src = image(32, 32, (x) => (x === 12 ? [0, 0, 0, 255] : [240, 240, 240, 255]));
    const out = smartPixelate(src, 32, 32, { ...plain, detail: 0.8 });
    expect(at(out, 32, 12, 4)).toEqual([0, 0, 0, 255]);
    expect(at(out, 32, 20, 4)).toEqual([240, 240, 240, 255]);
  });
  it("picks the majority side of a hard edge without blending colors", () => {
    const src = image(16, 8, (x) => (x < 6 ? [255, 0, 0, 255] : [0, 0, 255, 255]));
    const out = smartPixelate(src, 16, 8, { ...plain, detail: 0 });
    expect(at(out, 16, 0, 0)).toEqual([255, 0, 0, 255]);
  });
  it("quantizes to the requested levels per channel", () => {
    const src = image(8, 8, () => [100, 150, 200, 255]);
    const out = smartPixelate(src, 8, 8, { ...plain, colors: 2 });
    expect(at(out, 8, 0, 0)).toEqual([0, 255, 255, 255]);
  });
  it("leaves transparent blocks transparent and skips blocks outside the mask", () => {
    const src = image(16, 8, (x) => (x < 8 ? [0, 0, 0, 0] : [10, 20, 30, 255]));
    const weight = new Uint8ClampedArray(16 * 8).map((_, i) => (i % 16 < 8 ? 255 : 0));
    const out = smartPixelate(src, 16, 8, plain, weight);
    expect(at(out, 16, 0, 0)[3]).toBe(0);
    expect(at(out, 16, 12, 3)).toEqual([10, 20, 30, 255]);
  });
});
