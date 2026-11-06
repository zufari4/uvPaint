import { describe, it, expect } from "vitest";
import { History } from "../src/core/history";
import type { Layer, TextureDocument } from "../src/types";

const buffer = (size = 2048) => ({ width: size, height: size }) as HTMLCanvasElement;
const doc = (layers: Layer[]): TextureDocument => ({
  id: "d", name: "d", width: 2048, height: 2048, layers, activeId: layers[0].id, selection: null,
  uvSet: "uv", islands: [], selectedIslands: [], restrict: false,
});

describe("Undo history", () => {
  it("keeps many steps for a large layer stack whose untouched buffers stay shared", () => {
    let layers: Layer[] = Array.from({ length: 40 }, (_, i) => ({
      id: String(i), name: String(i), visible: true, opacity: 1, blend: "source-over", canvas: buffer(),
    }));
    const history = new History();
    for (let step = 0; step < 25; step++) {
      history.push("Brush stroke", doc(layers));
      layers = layers.map((l, i) => (i === step % 3 ? { ...l, canvas: buffer() } : l));
    }
    expect(history.undoStack.length).toBe(25);
  });
  it("still drops the oldest steps once replaced buffers exceed the budget", () => {
    let layers: Layer[] = [{ id: "a", name: "a", visible: true, opacity: 1, blend: "source-over", canvas: buffer(4096) }];
    const history = new History();
    for (let step = 0; step < 20; step++) {
      history.push("Brush stroke", doc(layers));
      layers = [{ ...layers[0], canvas: buffer(4096) }];
    }
    expect(history.undoStack.length).toBeLessThan(20);
    expect(history.undoStack.length).toBeGreaterThan(5);
  });
});
