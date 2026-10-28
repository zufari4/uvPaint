import { describe, it, expect } from "vitest";
import { homography, mapPoint, validQuad } from "../src/tools/homography";
import { History } from "../src/core/history";
import type { TextureDocument } from "../src/types";
describe("Projective mapping", () => {
  const square = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ];
  it("maps all four corners exactly, with non-affine foreshortening", () => {
    const quad = [
      { x: 10, y: 20 },
      { x: 200, y: 30 },
      { x: 150, y: 180 },
      { x: 40, y: 140 },
    ];
    const h = homography(square, quad);
    square.forEach((p, i) => {
      expect(mapPoint(h, p).x).toBeCloseTo(quad[i].x, 8);
      expect(mapPoint(h, p).y).toBeCloseTo(quad[i].y, 8);
    });
    const midpoint = mapPoint(h, { x: 0.5, y: 0 });
    expect(Math.abs(midpoint.x - 105)).toBeGreaterThan(1);
    expect((midpoint.y - 20) / (midpoint.x - 10)).toBeCloseTo(10 / 190, 8);
  });
  it("round trips arbitrary interior coordinates", () => {
    const quad = [
      { x: 30, y: 0 },
      { x: 300, y: 20 },
      { x: 220, y: 250 },
      { x: 0, y: 180 },
    ];
    const h = homography(square, quad),
      inv = homography(quad, square);
    for (const p of [
      { x: 0.1, y: 0.8 },
      { x: 0.9, y: 0.2 },
      { x: 0.5, y: 0.5 },
    ]) {
      const q = mapPoint(inv, mapPoint(h, p));
      expect(q.x).toBeCloseTo(p.x, 8);
      expect(q.y).toBeCloseTo(p.y, 8);
    }
  });
  it("rejects crossed or degenerate quads, accepts reflections", () => {
    expect(validQuad(square)).toBe(true);
    expect(validQuad([square[1], square[0], square[3], square[2]])).toBe(true);
    expect(validQuad([square[0], square[2], square[1], square[3]])).toBe(false);
    expect(validQuad(square.map((p) => ({ ...p, y: 0 })))).toBe(false);
  });
});
describe("History", () => {
  it("restores layers, selection and material-local state without mutating snapshots", () => {
    const h = new History();
    const doc: TextureDocument = {
      id: "a",
      width: 32,
      height: 32,
      name: "A",
      layers: [],
      activeId: "",
      selection: null,
      uvSet: "uv",
      islands: [],
      selectedIslands: [1],
      restrict: false,
    };
    h.push("clip", doc);
    doc.selectedIslands.push(2);
    doc.restrict = true;
    const old = h.undo(doc)!;
    expect(old.restrict).toBe(false);
    expect(old.selectedIslands).toEqual([1]);
    expect(h.redo(old)?.restrict).toBe(true);
    h.undo(doc);
    h.push("new edit", doc);
    expect(h.redoStack).toHaveLength(0);
  });
});
