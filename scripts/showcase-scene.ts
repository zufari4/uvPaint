import * as THREE from "three";

// A small UV-mapped scene for the README screenshots: a wooden crate and a painted fuel barrel.
const S = 2048;
const cells = [
  [0.03, 0.03], [0.28, 0.03], [0.53, 0.03],
  [0.03, 0.28], [0.28, 0.28], [0.53, 0.28],
];
const cell = 0.22;
const side = { x: 0.03, y: 0.55, w: 0.75, h: 0.25 };
const caps = [{ x: 0.87, y: 0.15 }, { x: 0.87, y: 0.4 }];
const capRadius = 0.1;

function random(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function wood(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, label: string, seed: number) {
  const r = random(seed);
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, size, size); ctx.clip();
  ctx.fillStyle = "#94643a"; ctx.fillRect(x, y, size, size);
  const planks = 5, ph = size / planks;
  for (let i = 0; i < planks; i++) {
    ctx.fillStyle = `hsl(${26 + r() * 6}, ${42 + r() * 10}%, ${36 + r() * 8}%)`;
    ctx.fillRect(x, y + i * ph, size, ph);
    for (let g = 0; g < 26; g++) {
      ctx.strokeStyle = `rgba(60,32,14,${0.12 + r() * 0.18})`; ctx.lineWidth = 1 + r() * 2;
      const gy = y + i * ph + r() * ph;
      ctx.beginPath(); ctx.moveTo(x, gy);
      ctx.bezierCurveTo(x + size * 0.3, gy + (r() - 0.5) * 10, x + size * 0.7, gy + (r() - 0.5) * 10, x + size, gy + (r() - 0.5) * 6);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(30,16,8,0.55)"; ctx.fillRect(x, y + i * ph, size, 4);
  }
  const frame = size * 0.09;
  ctx.fillStyle = "#6b4424";
  ctx.fillRect(x, y, size, frame); ctx.fillRect(x, y + size - frame, size, frame);
  ctx.fillRect(x, y, frame, size); ctx.fillRect(x + size - frame, y, frame, size);
  ctx.strokeStyle = "#6b4424"; ctx.lineWidth = frame * 0.9;
  ctx.beginPath(); ctx.moveTo(x + frame, y + size - frame); ctx.lineTo(x + size - frame, y + frame); ctx.stroke();
  ctx.fillStyle = "#3b3f42";
  for (const [nx, ny] of [[0.045, 0.045], [0.955, 0.045], [0.045, 0.955], [0.955, 0.955]])
    { ctx.beginPath(); ctx.arc(x + size * nx, y + size * ny, size * 0.018, 0, Math.PI * 2); ctx.fill(); }
  if (label) {
    ctx.fillStyle = "rgba(25,25,25,0.82)"; ctx.font = `bold ${Math.round(size * 0.12)}px Arial`; ctx.textAlign = "center";
    ctx.fillText(label, x + size / 2, y + size * 0.42);
  }
  ctx.restore();
}

function barrel(ctx: CanvasRenderingContext2D) {
  const x = side.x * S, y = side.y * S, w = side.w * S, h = side.h * S, r = random(7);
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, "#9e3626"); g.addColorStop(0.5, "#c24a33"); g.addColorStop(1, "#9e3626");
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  for (const t of [0.12, 0.88]) {
    ctx.fillStyle = "#7d2a1d"; ctx.fillRect(x, y + h * t - h * 0.035, w, h * 0.07);
    ctx.fillStyle = "rgba(255,200,170,0.35)"; ctx.fillRect(x, y + h * t - h * 0.035, w, h * 0.012);
  }
  const band = { y: y + h * 0.3, h: h * 0.14 };
  ctx.save(); ctx.beginPath(); ctx.rect(x, band.y, w, band.h); ctx.clip();
  ctx.fillStyle = "#f2c230"; ctx.fillRect(x, band.y, w, band.h);
  ctx.fillStyle = "#1d1d1d";
  for (let sx = x - band.h; sx < x + w; sx += band.h * 1.4) {
    ctx.beginPath(); ctx.moveTo(sx, band.y + band.h); ctx.lineTo(sx + band.h * 0.7, band.y + band.h);
    ctx.lineTo(sx + band.h * 1.4, band.y); ctx.lineTo(sx + band.h * 0.7, band.y); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = "#f4efe6"; ctx.font = `bold ${Math.round(h * 0.16)}px Arial`; ctx.textAlign = "center";
  for (const cx of [0.25, 0.75]) ctx.fillText("FUEL · 200 L", x + w * cx, y + h * 0.7);
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = `rgba(${90 + r() * 40},${45 + r() * 20},20,${0.08 + r() * 0.2})`;
    ctx.beginPath(); ctx.ellipse(x + r() * w, y + r() * h, 4 + r() * 22, 3 + r() * 10, r() * 3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function cap(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  const x = cx * S, y = cy * S, rad = capRadius * S;
  const g = ctx.createRadialGradient(x - rad * 0.3, y - rad * 0.3, rad * 0.1, x, y, rad);
  g.addColorStop(0, "#c9493a"); g.addColorStop(1, "#8f3022");
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#6e2318"; ctx.lineWidth = rad * 0.08;
  ctx.beginPath(); ctx.arc(x, y, rad * 0.88, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = "#4b4f52"; ctx.beginPath(); ctx.arc(x + rad * 0.45, y - rad * 0.2, rad * 0.14, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#2c2f31"; ctx.beginPath(); ctx.arc(x + rad * 0.45, y - rad * 0.2, rad * 0.07, 0, Math.PI * 2); ctx.fill();
}

function atlas() {
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#2a2f33"; ctx.fillRect(0, 0, S, S);
  const labels = ["SUPPLY 07", "", "FRAGILE", "", "THIS SIDE UP", ""];
  cells.forEach(([cx, cy], i) => wood(ctx, cx * S, cy * S, cell * S, labels[i], 11 + i));
  barrel(ctx);
  caps.forEach((p) => cap(ctx, p.x, p.y));
  return c;
}

function remap(geometry: THREE.BufferGeometry, group: number, map: (u: number, v: number) => [number, number]) {
  const uv = geometry.getAttribute("uv") as THREE.BufferAttribute, index = geometry.index!;
  const { start, count } = geometry.groups[group], done = new Set<number>();
  for (let i = start; i < start + count; i++) {
    const k = index.getX(i);
    if (done.has(k)) continue;
    done.add(k);
    const [u, v] = map(uv.getX(k), uv.getY(k));
    uv.setXY(k, u, v);
  }
}

export function buildShowcase() {
  const texture = new THREE.CanvasTexture(atlas());
  texture.flipY = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.6 });
  material.name = "Depot props";
  const crate = new THREE.BoxGeometry(1.5, 1.5, 1.5);
  // BoxGeometry groups: +x, -x, +y, -y, +z, -z.
  const faceCell = [1, 3, 4, 5, 0, 2];
  faceCell.forEach((c, group) => remap(crate, group, (u, v) => [cells[c][0] + u * cell, cells[c][1] + (1 - v) * cell]));
  crate.clearGroups();
  const crateMesh = new THREE.Mesh(crate, material);
  crateMesh.name = "Crate";
  crateMesh.position.set(-1.05, 0, 0.2);
  crateMesh.rotation.y = 0.35;
  const drum = new THREE.CylinderGeometry(0.72, 0.72, 1.9, 48, 1);
  remap(drum, 0, (u, v) => [side.x + u * side.w, side.y + (1 - v) * side.h]);
  remap(drum, 1, (u, v) => [caps[0].x + (u - 0.5) * 2 * capRadius, caps[0].y + (0.5 - v) * 2 * capRadius]);
  remap(drum, 2, (u, v) => [caps[1].x + (u - 0.5) * 2 * capRadius, caps[1].y + (0.5 - v) * 2 * capRadius]);
  drum.clearGroups();
  // sin(2π) leaves -0.000000 keys that would split the cap outline at the seam.
  for (const name of ["position", "uv"]) {
    const a = drum.getAttribute(name) as THREE.BufferAttribute;
    for (let i = 0; i < a.array.length; i++) if (Math.abs(a.array[i]) < 1e-9) (a.array as Float32Array)[i] = 0;
  }
  const drumMesh = new THREE.Mesh(drum, material);
  drumMesh.name = "Fuel drum";
  drumMesh.position.set(1.05, 0.2, -0.1);
  const scene = new THREE.Group();
  scene.add(crateMesh, drumMesh);
  return scene;
}
