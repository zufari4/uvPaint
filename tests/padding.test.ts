import { describe, it, expect } from "vitest";
import { dilateIslands } from "../src/export/padding";

const strip = (width: number, height: number, islands: [number, number, number[]][]) => {
  const pixels = new Uint8ClampedArray(width * height * 4), inside = new Uint8Array(width * height);
  for (const [from, to, color] of islands)
    for (let y = 0; y < height; y++)
      for (let x = from; x <= to; x++) { inside[y * width + x] = 1; pixels.set(color, (y * width + x) * 4); }
  return { pixels, inside };
};
const at = (pixels: Uint8ClampedArray, width: number, x: number, y = 2) => [...pixels.slice((y * width + x) * 4, (y * width + x) * 4 + 4)];

describe("Island edge padding", () => {
  it("extends each island by half of the smallest gap", () => {
    const red = [255, 0, 0, 255], blue = [0, 0, 255, 255];
    const { pixels, inside } = strip(30, 5, [[0, 4, red], [13, 17, blue]]);
    expect(dilateIslands(pixels, inside, 30, 5)).toEqual({ padding: 8, radius: 4 });
    for (let x = 5; x <= 8; x++) expect(at(pixels, 30, x)).toEqual(red);
    for (let x = 9; x <= 12; x++) expect(at(pixels, 30, x)).toEqual(blue);
    expect(at(pixels, 30, 21)).toEqual(blue);
    expect(at(pixels, 30, 22)).toEqual([0, 0, 0, 0]);
  });
  it("leaves the texture untouched when islands are a single pixel apart", () => {
    const { pixels, inside } = strip(12, 5, [[0, 4, [9, 9, 9, 255]], [6, 9, [7, 7, 7, 255]]]);
    expect(dilateIslands(pixels, inside, 12, 5)).toEqual({ padding: 1, radius: 0 });
    expect(at(pixels, 12, 10)).toEqual([0, 0, 0, 0]);
  });
  it("uses the maximum radius for a lone island", () => {
    const { pixels, inside } = strip(60, 3, [[0, 3, [1, 2, 3, 255]]]);
    expect(dilateIslands(pixels, inside, 60, 3, 10)).toEqual({ padding: null, radius: 10 });
    expect(at(pixels, 60, 13, 1)).toEqual([1, 2, 3, 255]);
    expect(at(pixels, 60, 14, 1)).toEqual([0, 0, 0, 0]);
  });
});
