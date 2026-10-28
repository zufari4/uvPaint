import * as THREE from "three";
import type { Island, Point, TextureDocument } from "../types";
import { canvas, context, cloneCanvas } from "../core/canvas";
export function extractIslands(
  scene: THREE.Object3D,
  materialId: string,
  uvSet: string,
  textureOverride?: THREE.Texture | null,
): Island[] {
  const triangles: Point[][] = [];
  const edges = new Map<string, number[]>();
  const vertex = (p: Point) => `${p.x.toFixed(6)},${p.y.toFixed(6)}`;
  scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const g = obj.geometry as THREE.BufferGeometry;
    const uv = g.getAttribute(uvSet),
      position = g.getAttribute("position");
    if (!uv) return;
    const multiple = Array.isArray(obj.material);
    const mats = multiple
      ? (obj.material as THREE.Material[])
      : [obj.material as THREE.Material];
    const index = g.index;
    const groups =
      multiple && g.groups.length
        ? g.groups
        : [
            {
              start: 0,
              count: index ? index.count : uv.count,
              materialIndex: 0,
            },
          ];
    for (const group of groups) {
      const mat = mats[group.materialIndex ?? 0];
      if (mat?.userData.slotId !== materialId) continue;
      const texture =
        textureOverride === undefined
          ? (mat as THREE.MeshBasicMaterial).map
          : textureOverride;
      texture?.updateMatrix();
      for (let i = group.start; i < group.start + group.count; i += 3) {
        const keys: string[] = [];
        const tri = [0, 1, 2].map((n) => {
          const k = index ? index.getX(i + n) : i + n;
          const point = new THREE.Vector2(uv.getX(k), uv.getY(k));
          if (texture) point.applyMatrix3(texture.matrix);
          keys.push(
            `${obj.uuid}:${position.getX(k).toFixed(6)},${position.getY(k).toFixed(6)},${position.getZ(k).toFixed(6)}:${vertex(point)}`,
          );
          return { x: point.x, y: point.y };
        });
        const id = triangles.length;
        triangles.push(tri);
        for (let edge = 0; edge < 3; edge++) {
          const key = [keys[edge], keys[(edge + 1) % 3]].sort().join("|");
          const list = edges.get(key) ?? [];
          list.push(id);
          edges.set(key, list);
        }
      }
    }
  });
  const parent = triangles.map((_, i) => i);
  const find = (n: number): number => {
    while (parent[n] !== n) {
      parent[n] = parent[parent[n]];
      n = parent[n];
    }
    return n;
  };
  for (const list of edges.values())
    for (let i = 1; i < list.length; i++) parent[find(list[i])] = find(list[0]);
  const groups = new Map<number, Point[][]>();
  triangles.forEach((t, i) => {
    const root = find(i);
    const list = groups.get(root) ?? [];
    list.push(t);
    groups.set(root, list);
  });
  return [...groups.values()].map((t, id) => ({ id, triangles: t }));
}
export function traceIslands(
  ctx: CanvasRenderingContext2D,
  islands: Island[],
  w: number,
  h: number,
) {
  ctx.beginPath();
  for (const island of islands)
    for (const tri of island.triangles) {
      // Consistent winding makes this a union even when mirrored islands overlap.
      // Opposite windings would cancel under Canvas's nonzero fill rule.
      const [a, b, c] = tri;
      const reverse = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) < 0;
      const second = reverse ? c : b;
      const third = reverse ? b : c;
      ctx.moveTo(tri[0].x * w, tri[0].y * h);
      ctx.lineTo(second.x * w, second.y * h);
      ctx.lineTo(third.x * w, third.y * h);
      ctx.closePath();
    }
}
export function islandMask(doc: TextureDocument) {
  const c = canvas(doc.width, doc.height);
  const ctx = context(c);
  ctx.fillStyle = "#fff";
  traceIslands(
    ctx,
    doc.selectedIslands.length
      ? doc.islands.filter((i) => doc.selectedIslands.includes(i.id))
      : doc.islands,
    doc.width,
    doc.height,
  );
  ctx.fill();
  return c;
}
export function editingMask(doc: TextureDocument, includeSelection = true) {
  let mask =
    includeSelection && doc.selection ? cloneCanvas(doc.selection) : null;
  if (doc.restrict) {
    const uv = islandMask(doc);
    if (mask) {
      const ctx = context(mask);
      ctx.globalCompositeOperation = "destination-in";
      ctx.drawImage(uv, 0, 0);
    } else mask = uv;
  }
  return mask;
}
export function hitIsland(doc: TextureDocument, p: Point) {
  const x = p.x / doc.width,
    y = p.y / doc.height;
  for (const island of doc.islands)
    for (const [a, b, c] of island.triangles) {
      const d = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
      if (Math.abs(d) < 1e-12) continue;
      const u = ((b.y - c.y) * (x - c.x) + (c.x - b.x) * (y - c.y)) / d,
        v = ((c.y - a.y) * (x - c.x) + (a.x - c.x) * (y - c.y)) / d;
      if (u >= 0 && v >= 0 && u + v <= 1) return island.id;
    }
  return -1;
}
