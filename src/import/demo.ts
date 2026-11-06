import * as THREE from "three";
import { canvas, context } from "../core/canvas";
import { prepareModel } from "./model";
import { hitIsland, islandMask } from "../tools/uv";
import type { Blend, Layer, TextureDocument } from "../types";

// Built-in sample: a supply crate and a fuel drum with proper UV layouts, two materials and
// several layers, some of them linked to UV islands, so every part of a project is represented.
const S = 1024;
// Crate atlas: six faces in a 3 × 2 grid.
const cell = 0.31;
const cells = [[0.02, 0.02], [0.345, 0.02], [0.67, 0.02], [0.02, 0.345], [0.345, 0.345], [0.67, 0.345]];
// BoxGeometry groups: +x, -x, +y, -y, +z, -z.
const faceCell = [1, 3, 4, 5, 0, 2];
// Drum atlas: the side as a band and both caps as discs.
const side = { x: 0.02, y: 0.02, w: 0.96, h: 0.46 };
const caps = [{ x: 0.25, y: 0.74 }, { x: 0.75, y: 0.74 }];
const capRadius = 0.22;

function random(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function remap(geometry: THREE.BufferGeometry, group: number, map: (u: number, v: number) => [number, number]) {
  const uv = geometry.getAttribute("uv") as THREE.BufferAttribute, index = geometry.index!;
  const { start, count } = geometry.groups[group], done = new Set<number>();
  for (let i = start; i < start + count; i++) {
    const k = index.getX(i);
    if (done.has(k)) continue;
    done.add(k);
    uv.setXY(k, ...map(uv.getX(k), uv.getY(k)));
  }
}
function wood(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, seed: number) {
  const r = random(seed), planks = 5, ph = size / planks, frame = size * 0.09;
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, size, size); ctx.clip();
  for (let i = 0; i < planks; i++) {
    ctx.fillStyle = `hsl(${26 + r() * 6}, ${42 + r() * 10}%, ${36 + r() * 8}%)`;
    ctx.fillRect(x, y + i * ph, size, ph);
    for (let g = 0; g < 18; g++) {
      ctx.strokeStyle = `rgba(60,32,14,${0.12 + r() * 0.18})`; ctx.lineWidth = 0.5 + r() * 1.5;
      const gy = y + i * ph + r() * ph;
      ctx.beginPath(); ctx.moveTo(x, gy);
      ctx.bezierCurveTo(x + size * 0.3, gy + (r() - 0.5) * 6, x + size * 0.7, gy + (r() - 0.5) * 6, x + size, gy + (r() - 0.5) * 4);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(30,16,8,0.55)"; ctx.fillRect(x, y + i * ph, size, 2);
  }
  ctx.fillStyle = "#6b4424";
  ctx.fillRect(x, y, size, frame); ctx.fillRect(x, y + size - frame, size, frame);
  ctx.fillRect(x, y, frame, size); ctx.fillRect(x + size - frame, y, frame, size);
  ctx.fillStyle = "#3b3f42";
  for (const [nx, ny] of [[0.045, 0.045], [0.955, 0.045], [0.045, 0.955], [0.955, 0.955]])
    { ctx.beginPath(); ctx.arc(x + size * nx, y + size * ny, size * 0.018, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}
function layer(name: string, draw: (ctx: CanvasRenderingContext2D) => void, opacity = 1, blend: Blend = "source-over"): Layer {
  const c = canvas(S, S);
  draw(context(c));
  return { id: crypto.randomUUID(), name, visible: true, opacity, blend, canvas: c };
}
/** Links a layer to the island under a UV point, as the island picker does. */
function link(doc: TextureDocument, l: Layer, u: number, v: number) {
  const id = hitIsland(doc, { x: u * doc.width, y: v * doc.height });
  const island = doc.islands.find((i) => i.id === id);
  if (!island) return l;
  l.uvBinding = { uvSet: doc.uvSet, island };
  l.uvMask = islandMask({ ...doc, islands: [island], selectedIslands: [] });
  return l;
}
function stencil(text: string, u: number, v: number, size: number, color = "rgba(28,28,28,0.85)") {
  return (ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = color;
    ctx.font = `bold ${size}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, u * S, v * S);
  };
}

export async function demoModel(check: (w: number, h: number) => Promise<void>) {
  const crateBase = canvas(S, S);
  const cb = context(crateBase);
  cb.fillStyle = "#2a2f33"; cb.fillRect(0, 0, S, S);
  cells.forEach(([cx, cy], i) => wood(cb, cx * S, cy * S, cell * S, 11 + i));
  const drumBase = canvas(S, S);
  const db = context(drumBase);
  db.fillStyle = "#2a2f33"; db.fillRect(0, 0, S, S);
  const sx = side.x * S, sy = side.y * S, sw = side.w * S, sh = side.h * S;
  const g = db.createLinearGradient(0, sy, 0, sy + sh);
  g.addColorStop(0, "#9e3626"); g.addColorStop(0.5, "#c24a33"); g.addColorStop(1, "#9e3626");
  db.fillStyle = g; db.fillRect(sx, sy, sw, sh);
  for (const t of [0.1, 0.9]) {
    db.fillStyle = "#7d2a1d"; db.fillRect(sx, sy + sh * t - sh * 0.035, sw, sh * 0.07);
    db.fillStyle = "rgba(255,200,170,0.35)"; db.fillRect(sx, sy + sh * t - sh * 0.035, sw, sh * 0.012);
  }
  for (const p of caps) {
    const x = p.x * S, y = p.y * S, rad = capRadius * S;
    const cg = db.createRadialGradient(x - rad * 0.3, y - rad * 0.3, rad * 0.1, x, y, rad);
    cg.addColorStop(0, "#c9493a"); cg.addColorStop(1, "#8f3022");
    db.fillStyle = cg; db.beginPath(); db.arc(x, y, rad, 0, Math.PI * 2); db.fill();
    db.strokeStyle = "#6e2318"; db.lineWidth = rad * 0.08;
    db.beginPath(); db.arc(x, y, rad * 0.88, 0, Math.PI * 2); db.stroke();
  }

  const texture = (c: HTMLCanvasElement) => {
    const t = new THREE.CanvasTexture(c);
    t.flipY = false;
    return t;
  };
  const crateMaterial = new THREE.MeshStandardMaterial({ map: texture(crateBase) });
  crateMaterial.name = "Crate wood";
  const drumMaterial = new THREE.MeshStandardMaterial({ map: texture(drumBase) });
  drumMaterial.name = "Drum paint";

  const crate = new THREE.BoxGeometry(1.5, 1.5, 1.5);
  faceCell.forEach((c, group) => remap(crate, group, (u, v) => [cells[c][0] + u * cell, cells[c][1] + (1 - v) * cell]));
  crate.clearGroups();
  const crateMesh = new THREE.Mesh(crate, crateMaterial);
  crateMesh.name = "Crate";
  crateMesh.position.set(-1.05, 0, 0.2);
  crateMesh.rotation.y = 0.35;
  const drum = new THREE.CylinderGeometry(0.7, 0.7, 1.9, 32, 1);
  remap(drum, 0, (u, v) => [side.x + u * side.w, side.y + (1 - v) * side.h]);
  remap(drum, 1, (u, v) => [caps[0].x + (u - 0.5) * 2 * capRadius, caps[0].y + (0.5 - v) * 2 * capRadius]);
  remap(drum, 2, (u, v) => [caps[1].x + (u - 0.5) * 2 * capRadius, caps[1].y + (0.5 - v) * 2 * capRadius]);
  drum.clearGroups();
  // sin(2π) leaves -0.000000 keys that would split the cap outline at the seam.
  for (const name of ["position", "uv"]) {
    const a = drum.getAttribute(name) as THREE.BufferAttribute;
    for (let i = 0; i < a.array.length; i++) if (Math.abs(a.array[i]) < 1e-9) (a.array as Float32Array)[i] = 0;
  }
  const drumMesh = new THREE.Mesh(drum, drumMaterial);
  drumMesh.name = "Fuel drum";
  drumMesh.position.set(1.05, 0.2, -0.1);
  const scene = new THREE.Group();
  scene.add(crateMesh, drumMesh);

  const result = await prepareModel(scene, "Supply depot · sample", check);
  const [crateDoc, drumDoc] = result.docs;
  const centre = (i: number) => [cells[i][0] + cell / 2, cells[i][1] + cell / 2] as const;
  crateDoc.layers[0].name = "Wood planks";
  crateDoc.layers.push(
    link(crateDoc, layer("Stencil · SUPPLY 07", stencil("SUPPLY 07", centre(0)[0], centre(0)[1], 44)), ...centre(0)),
    link(crateDoc, layer("Stencil · FRAGILE", stencil("FRAGILE", centre(2)[0], centre(2)[1], 50, "rgba(150,30,20,0.85)")), ...centre(2)),
    layer("Dirt", (ctx) => {
      const r = random(5);
      for (let i = 0; i < 120; i++) {
        ctx.fillStyle = `rgba(${60 + r() * 30},${45 + r() * 20},25,${0.08 + r() * 0.18})`;
        ctx.beginPath(); ctx.ellipse(r() * S, r() * S * 0.68, 3 + r() * 16, 2 + r() * 8, r() * 3, 0, Math.PI * 2); ctx.fill();
      }
    }, 0.8, "multiply"),
  );
  drumDoc.layers[0].name = "Red paint";
  const band = { y: side.y + side.h * 0.3, h: side.h * 0.14 };
  drumDoc.layers.push(
    link(drumDoc, layer("Hazard stripe", (ctx) => {
      const y = band.y * S, h = band.h * S;
      ctx.save(); ctx.beginPath(); ctx.rect(0, y, S, h); ctx.clip();
      ctx.fillStyle = "#f2c230"; ctx.fillRect(0, y, S, h);
      ctx.fillStyle = "#1d1d1d";
      for (let x = -h; x < S; x += h * 1.4) {
        ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x + h * 0.7, y + h); ctx.lineTo(x + h * 1.4, y); ctx.lineTo(x + h * 0.7, y); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }), side.x + side.w / 2, side.y + side.h / 2),
    link(drumDoc, layer("Label · FUEL 200 L", (ctx) => {
      for (const u of [0.27, 0.73]) stencil("FUEL · 200 L", u, side.y + side.h * 0.7, 40, "#f4efe6")(ctx);
    }), side.x + side.w / 2, side.y + side.h / 2),
  );
  result.model.source = { kind: "sample" };
  return result;
}
