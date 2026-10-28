import type { Mesh, BufferGeometry } from "three";
const originals = new WeakMap<Mesh, BufferGeometry>();
export function sourceGeometry(mesh: Mesh): BufferGeometry {
  let geometry = originals.get(mesh);
  if (!geometry) { geometry = mesh.geometry; originals.set(mesh, geometry); }
  return geometry;
}
