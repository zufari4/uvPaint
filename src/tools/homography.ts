import { Matrix, solve } from "ml-matrix";
import type { Point } from "../types";
export function homography(from: Point[], to: Point[]): number[] {
  const a: number[][] = [],
    b: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i],
      u = to[i].x,
      v = to[i].y;
    a.push(
      [x, y, 1, 0, 0, 0, -u * x, -u * y],
      [0, 0, 0, x, y, 1, -v * x, -v * y],
    );
    b.push([u], [v]);
  }
  const h = solve(new Matrix(a), new Matrix(b)).to1DArray();
  return [...h, 1];
}
export function mapPoint(h: number[], p: Point) {
  const d = h[6] * p.x + h[7] * p.y + h[8];
  return {
    x: (h[0] * p.x + h[1] * p.y + h[2]) / d,
    y: (h[3] * p.x + h[4] * p.y + h[5]) / d,
  };
}
export function validQuad(p: Point[]) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = p[i],
      b = p[(i + 1) % 4],
      c = p[(i + 2) % 4];
    const z = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(z) < 0.01) return false;
    if (sign && Math.sign(z) !== sign) return false;
    sign = Math.sign(z);
  }
  return true;
}
