import type { Island, IslandFace, Point, UVDisplayMode } from "../types";
export const faceKey = (face: Pick<IslandFace, "meshId" | "triangle">) => `${face.meshId}:${face.triangle}`;
type Edge = { a: Point; b: Point; vertices: string[]; triangles: number[]; diagonal: boolean };
const cache = new WeakMap<Island, Edge[]>();
const pointKey = (p: Point) => `${p.x.toFixed(6)},${p.y.toFixed(6)}`;
export function guideEdges(island: Island): Edge[] {
  const cached = cache.get(island);
  if (cached) return cached;
  const edges = new Map<string, Edge>();
  island.triangles.forEach((tri, i) => tri.forEach((a, n) => {
    const b = tri[(n+1)%3];
    const vertices = [island.faces?.[i].vertices[n] ?? pointKey(a), island.faces?.[i].vertices[(n+1)%3] ?? pointKey(b)].sort();
    const key = vertices.join("|");
    const edge = edges.get(key) ?? {a,b,vertices,triangles:[],diagonal:false};
    edge.triangles.push(i); edges.set(key,edge);
  }));
  const candidates: { edge: Edge; score: number; first: number }[] = [];
  for (const edge of edges.values()) {
    if (edge.triangles.length !== 2) continue;
    const [i,j] = edge.triangles;
    const n = island.faces?.[i].normal, m = island.faces?.[j].normal;
    if (n && m && n.reduce((sum,v,k) => sum+v*m[k],0) < Math.cos(Math.PI/12)) continue;
    const vertices = new Map<string, Point>();
    for (const index of [i,j]) island.triangles[index].forEach((p,k) =>
      vertices.set(island.faces?.[index].vertices[k] ?? pointKey(p),p));
    if (vertices.size !== 4) continue;
    const points = [...vertices.values()];
    const center = {x:points.reduce((s,p)=>s+p.x,0)/4,y:points.reduce((s,p)=>s+p.y,0)/4};
    points.sort((a,b)=>Math.atan2(a.y-center.y,a.x-center.x)-Math.atan2(b.y-center.y,b.x-center.x));
    const ends=[edge.a,edge.b].map(p=>points.findIndex(q=>pointKey(p)===pointKey(q)));
    if(Math.abs(ends[0]-ends[1])!==2)continue;
    let score = 0, convex = true;
    for (let k=0;k<4;k++) {
      const a=points[(k+3)%4], b=points[k], c=points[(k+1)%4];
      const cross=(b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);
      if (cross <= 1e-12) {convex=false; break;}
      const dot=(a.x-b.x)*(c.x-b.x)+(a.y-b.y)*(c.y-b.y);
      const length=Math.hypot(a.x-b.x,a.y-b.y)*Math.hypot(c.x-b.x,c.y-b.y);
      score += Math.abs(Math.acos(Math.max(-1,Math.min(1,dot/length)))-Math.PI/2);
    }
    if (convex) candidates.push({edge,score,first:Math.min(island.faces?.[i].triangle??i,island.faces?.[j].triangle??j)});
  }
  candidates.sort((a,b)=>a.score-b.score || a.first-b.first);
  const paired = new Set<number>();
  for (const {edge} of candidates) {
    if (edge.triangles.some(t=>paired.has(t))) continue;
    edge.diagonal=true; edge.triangles.forEach(t=>paired.add(t));
  }
  const result=[...edges.values()]; cache.set(island,result); return result;
}
export function traceGuides(ctx: CanvasRenderingContext2D, islands: Island[], mode: UVDisplayMode, w: number, h: number) {
  ctx.beginPath();
  if (mode === "off") return;
  for (const island of islands) for (const edge of guideEdges(island)) {
    if (mode === "outline" && edge.triangles.length !== 1) continue;
    if (mode === "quads" && edge.diagonal) continue;
    ctx.moveTo(edge.a.x*w,edge.a.y*h); ctx.lineTo(edge.b.x*w,edge.b.y*h);
  }
}
