import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { extractIslands } from "../src/tools/uv";
describe("UV material assignment and topology", () => {
  it("filters geometry groups by material without modifying geometry or UVs", () => {
    const a = new THREE.MeshBasicMaterial(),
      b = new THREE.MeshBasicMaterial();
    a.userData.slotId = "a";
    b.userData.slotId = "b";
    const geometry = new THREE.BoxGeometry();
    const uv = [...geometry.getAttribute("uv").array];
    const mesh = new THREE.Mesh(geometry, [a, b, a, b, a, b]);
    const islandsA = extractIslands(mesh, "a", "uv");
    const islandsB = extractIslands(mesh, "b", "uv");
    expect(islandsA.reduce((sum, i) => sum + i.triangles.length, 0)).toBe(6);
    expect(islandsB.reduce((sum, i) => sum + i.triangles.length, 0)).toBe(6);
    expect([...geometry.getAttribute("uv").array]).toEqual(uv);
    expect(mesh.material).toEqual([a, b, a, b, a, b]);
  });
  it("keeps disconnected surfaces with coincident UVs as separate islands", () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [0, 0, 0, 1, 0, 0, 0, 1, 0, 3, 0, 0, 4, 0, 0, 3, 1, 0],
        3,
      ),
    );
    geometry.setAttribute(
      "uv",
      new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 2),
    );
    const material = new THREE.MeshBasicMaterial();
    material.userData.slotId = "a";
    expect(
      extractIslands(new THREE.Mesh(geometry, material), "a", "uv"),
    ).toHaveLength(2);
  });
});
