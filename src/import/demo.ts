import * as THREE from "three";
import { canvas, context } from "../core/canvas";
import { prepareModel } from "./model";
export async function demoModel(
  check: (w: number, h: number) => Promise<void>,
) {
  const scene = new THREE.Group();
  const c = canvas(1024, 1024);
  const ctx = context(c);
  ctx.fillStyle = "#d4d8d6";
  ctx.fillRect(0, 0, 1024, 1024);
  ctx.fillStyle = "#f06041";
  ctx.fillRect(0, 450, 1024, 200);
  ctx.fillStyle = "#253b3c";
  ctx.fillRect(0, 0, 1024, 230);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 105px Arial";
  ctx.fillText("FIELD", 110, 380);
  ctx.font = "30px Arial";
  ctx.fillText("EQUIPMENT / 024", 115, 715);
  for (let i = 0; i < 11; i++) {
    ctx.fillStyle = i % 2 ? "#d4d8d6" : "#253b3c";
    ctx.fillRect(110 + i * 29, 800, 16, 80);
  }
  const mat = new THREE.MeshStandardMaterial({
    map: new THREE.CanvasTexture(c),
  });
  mat.name = "Shell / printed";
  const trim = new THREE.MeshStandardMaterial({ color: "#455357" });
  trim.name = "Cap / blank";
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 2.8, 0.8), mat);
  const uv = body.geometry.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  body.name = "Container body";
  body.position.y = 0.2;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(2.08, 0.28, 0.87), trim);
  cap.position.y = 1.73;
  cap.name = "Top cap";
  scene.add(body, cap);
  const result = await prepareModel(scene, "Field kit · sample", check);
  const d = result.docs[1];
  const x = context(d.layers[0].canvas);
  x.fillStyle = "#455357";
  x.fillRect(0, 0, d.width, d.height);
  d.layers[0].name = "Cap color";
  result.model.source = { kind: "sample" };
  return result;
}
