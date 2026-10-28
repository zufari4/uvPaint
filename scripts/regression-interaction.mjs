import { _electron as electron } from "playwright";
import { createServer } from "vite";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const server = await createServer();
await server.listen();
const env = { ...process.env, UVPAINT_DEV_URL: "http://127.0.0.1:5173" };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ["."], env });
const checks = [];
await mkdir("test-results", { recursive: true });
const ok = (value, label) => {
  assert.ok(value, label);
  checks.push(label);
  console.log("PASS", label);
};
try {
  const page = await app.firstWindow(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.waitForSelector(".empty-canvas");
  const clipping = await page.evaluate(async () => {
    const { editor: e, Editor } = await import("/src/core/editor.ts");
    const THREE = await import("/node_modules/three/build/three.module.js");
    const { GLTFExporter } =
      await import("/node_modules/three/examples/jsm/exporters/GLTFExporter.js");
    const { canvas, context, toPNG } = await import("/src/core/canvas.ts");
    const { PaintStroke } = await import("/src/tools/paint.ts");
    const scene = new THREE.Group(),
      image = canvas(128, 128);
    context(image).fillStyle = "#000";
    context(image).fillRect(0, 0, 128, 128);
    const mat = new THREE.MeshStandardMaterial({
      map: new THREE.CanvasTexture(image),
    });
    for (const start of [0.2, 0.6]) {
      const g = new THREE.PlaneGeometry(1, 1),
        uv = g.getAttribute("uv");
      for (let i = 0; i < uv.count; i++)
        uv.setXY(i, start + uv.getX(i) * 0.2, 0.2 + uv.getY(i) * 0.6);
      const mesh = new THREE.Mesh(g, mat);
      mesh.position.x = start * 3;
      scene.add(mesh);
    }
    const glb = await new GLTFExporter().parseAsync(scene, { binary: true });
    await e.importModel(new Uint8Array(glb), "UV clipping test.glb");
    const defaults = e.doc.restrict && e.doc.selectedIslands.length === 0;
    e.addEmpty();
    e.tool = "brush";
    e.color = "#ff0000";
    e.brushSize = 24;
    const stroke = new PaintStroke(e, { x: 0, y: 64 });
    stroke.draw({ x: 128, y: 64 });
    stroke.finish();
    const alpha = (x) =>
      context(e.layer.canvas).getImageData(x, 64, 1, 1).data[3];
    const all = [16, 38, 64, 90, 120].map(alpha);
    e.undo();
    const undone = alpha(38) === 0;
    e.redo();
    const redone = alpha(38) === 255;
    e.addEmpty();
    e.doc.selectedIslands = [0];
    new PaintStroke(e, { x: 90, y: 64 }).finish();
    const selected = alpha(90) === 0;
    e.doc.selectedIslands = [];
    e.doc.restrict = false;
    new PaintStroke(e, { x: 64, y: 64 }).finish();
    const disabled = alpha(64) === 255;
    e.doc.restrict = true;
    const standalone = new Editor();
    await standalone.newCanvas(32, 32);
    const blank = !standalone.doc.restrict;
    const red = canvas(128, 128);
    context(red).fillStyle = "#ff0000";
    context(red).fillRect(0, 0, 128, 128);
    await e.importImage(
      new Uint8Array(await (await toPNG(red)).arrayBuffer()),
      "placement.png",
    );
    e.uvVisible = false;
    e.emit();
    const ghost = context(e.transform.outside).getImageData(64, 64, 1, 1)
      .data[3];
    const layerGap = context(e.layer.canvas).getImageData(64, 64, 1, 1).data[3];
    return {
      defaults,
      all,
      undone,
      redone,
      selected,
      disabled,
      blank,
      ghost,
      layerGap,
    };
  });
  ok(
    clipping.defaults,
    "UV clipping defaults to all islands without selection",
  );
  ok(
    JSON.stringify(clipping.all) === "[0,255,0,255,0]",
    "Stroke crosses both islands while gaps and margins stay untouched",
  );
  ok(
    clipping.undone && clipping.redone,
    "Clipped stroke undo and redo preserve pixels",
  );
  ok(
    clipping.selected && clipping.disabled && clipping.blank,
    "Selected islands narrow clipping; opt-out and standalone canvas work",
  );
  ok(
    clipping.ghost === 255 && clipping.layerGap === 255,
    "Placement retains full layer pixels and shows a separate outside ghost",
  );
  await page.getByTitle("Fit canvas", { exact: true }).click();
  const geometry = async () => {
    const box = await page.getByTestId("texture-canvas").boundingBox();
    const state = await page.evaluate(async () => {
      const { editor: e } = await import("/src/core/editor.ts");
      return {
        width: e.doc.width,
        height: e.doc.height,
        points: e.transform?.points,
      };
    });
    const z = Math.min(
      (box.width - 100) / state.width,
      (box.height - 100) / state.height,
    );
    return {
      ...state,
      z,
      box,
      origin: {
        x: box.x + (box.width - state.width * z) / 2,
        y: box.y + (box.height - state.height * z) / 2,
      },
    };
  };
  let g = await geometry();
  await page.waitForTimeout(80);
  const ghostPixel = await page
    .getByTestId("texture-canvas")
    .evaluate((c, g) => {
      const ratio = c.width / g.box.width;
      return [
        ...c
          .getContext("2d")
          .getImageData(
            Math.round((g.origin.x - g.box.x + 64 * g.z) * ratio),
            Math.round((g.origin.y - g.box.y + 40 * g.z) * ratio),
            1,
            1,
          ).data,
      ];
    }, g);
  ok(
    Math.abs(ghostPixel[0] - 102) <= 1 &&
      ghostPixel[1] === 0 &&
      ghostPixel[2] === 0,
    "Outside-island placement is visibly rendered at 40% opacity",
  );
  await page.screenshot({ path: "test-results/06-placement-ghost.png" });
  const drag = async (a, b, button = "left") => {
    await page.mouse.move(a.x, a.y);
    await page.mouse.down({ button });
    await page.mouse.move(b.x, b.y, { steps: 8 });
    await page.mouse.up({ button });
    await page.waitForTimeout(100);
  };
  const screen = (p, g) => ({
    x: g.origin.x + p.x * g.z,
    y: g.origin.y + p.y * g.z,
  });
  await drag(screen(g.points[2], g), screen({ x: 96, y: 96 }, g));
  let after = await geometry();
  ok(
    Math.abs(after.points[2].x - 96) < 1 &&
      Math.abs(after.points[2].y - 96) < 1 &&
      after.points[0].x === 0,
    "Actual corner drag scales proportionally with fixed opposite corner",
  );
  const center = { x: 48, y: 48 },
    r = { x: 48, y: -28 / after.z };
  await drag(
    screen(r, after),
    screen({ x: center.x + 48 + 28 / after.z, y: center.y }, after),
  );
  after = await geometry();
  ok(
    Math.abs(after.points[0].x - 96) < 1 && Math.abs(after.points[0].y) < 1,
    "Actual rotation handle turns the image 90 degrees",
  );
  await page.keyboard.down("Control");
  await drag(screen(after.points[0], after), screen({ x: 80, y: 10 }, after));
  await page.keyboard.up("Control");
  after = await geometry();
  ok(
    Math.abs(after.points[0].x - 80) < 1 &&
      Math.abs(after.points[1].x - 96) < 1,
    "Ctrl corner drag distorts only that corner",
  );
  await page.keyboard.press("Enter");
  ok(
    await page.evaluate(async () => {
      const { editor: e } = await import("/src/core/editor.ts");
      return (
        !e.transform &&
        e.layer.canvas.getContext("2d").getImageData(64, 64, 1, 1).data[3] === 255 &&
        e.layer.uvMask.getContext("2d").getImageData(64, 64, 1, 1).data[3] === 0
      );
    }),
    "Applying transform hides outside pixels with a mask without deleting them",
  );
  await page.keyboard.press("b");
  await page.keyboard.press("Digit5");
  await page.keyboard.press("d");
  await page.keyboard.press("x");
  await page.keyboard.press("BracketRight");
  ok(
    await page.evaluate(async () => {
      const { editor: e } = await import("/src/core/editor.ts");
      return (
        e.tool === "brush" &&
        e.brushOpacity === 0.5 &&
        e.color === "#ffffff" &&
        e.backgroundColor === "#000000" &&
        e.brushSize === 29
      );
    }),
    "Photoshop brush, opacity, color swap and size shortcuts",
  );
  await page.keyboard.press("l");
  await page.keyboard.press("Shift+l");
  ok(
    await page.evaluate(async () => {
      const { editor: e } = await import("/src/core/editor.ts");
      return e.tool === "polygon";
    }),
    "Shift+L cycles to polygonal lasso",
  );
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Control+d");
  await page.keyboard.press("Control+t");
  ok(
    await page.evaluate(async () => {
      const { editor: e } = await import("/src/core/editor.ts");
      return !e.doc.selection && e.transform.kind === "free";
    }),
    "Ctrl+A, Ctrl+D and Ctrl+T work on canvas",
  );
  await page.keyboard.press("Escape");
  await page.evaluate(async () => {
    const { editor: e } = await import("/src/core/editor.ts");
    await e.sample();
  });
  const viewport = page.getByTestId("preview-canvas");
  await page.waitForTimeout(300);
  const box = await viewport.boundingBox(),
    center3 = { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    end = { x: center3.x + 60, y: center3.y + 35 };
  const capture = async () => {
    let previous = "";
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(100);
      const current = await viewport.evaluate((c) => c.toDataURL());
      if (current === previous) return current;
      previous = current;
    }
    throw new Error("Viewport did not settle");
  };
  let before = await capture();
  await drag(center3, end);
  ok(before === (await capture()), "Left drag does not orbit");
  before = await capture();
  await drag(center3, end, "middle");
  ok(before !== (await capture()), "Middle drag orbits the 3D model");
  before = await capture();
  await page.keyboard.down("Shift");
  await drag(center3, end, "middle");
  await page.keyboard.up("Shift");
  ok(before !== (await capture()), "Shift middle drag pans");
  before = await capture();
  await page.keyboard.down("Control");
  await drag(center3, end, "middle");
  await page.keyboard.up("Control");
  ok(before !== (await capture()), "Ctrl middle drag zooms");
  await page.keyboard.press("Home");
  await page.waitForTimeout(80);
  before = await capture();
  await page.keyboard.press("Numpad1");
  await page.waitForTimeout(80);
  ok(before !== (await capture()), "Numpad 1 selects front orthographic view");
  before = await capture();
  await page.keyboard.press("Numpad3");
  await page.waitForTimeout(80);
  ok(before !== (await capture()), "Numpad 3 selects side view");
  await page.keyboard.press("Numpad6");
  await page.waitForTimeout(80);
  before = await capture();
  await page.keyboard.press("Numpad5");
  await page.waitForTimeout(80);
  ok(before !== (await capture()), "Numpad 5 changes projection after orbit");
  await page.getByTitle("Model parts", { exact: true }).click();
  ok(
    await page
      .getByRole("group", { name: "Model parts visibility" })
      .isVisible(),
    "Model parts menu opens in viewport header",
  );
  await page.keyboard.press("Escape");
  const retained = await page.evaluate(async () => {
    const { Editor } = await import("/src/core/editor.ts");
    const { canvas, context, toPNG } = await import("/src/core/canvas.ts");
    const { composite } = await import("/src/render/composite.ts");
    const e = new Editor();
    await e.newCanvas(64, 64);
    e.doc.restrict = true;
    e.doc.islands = [{ id: 0, triangles: [
      [{x:0,y:0},{x:.5,y:0},{x:0,y:1}],
      [{x:.5,y:0},{x:.5,y:1},{x:0,y:1}],
    ] }];
    const source = canvas(128, 64);
    context(source).fillStyle = "#ff0000";
    context(source).fillRect(0, 0, 64, 64);
    context(source).fillStyle = "#0000ff";
    context(source).fillRect(64, 0, 64, 64);
    await e.importImage(new Uint8Array(await (await toPNG(source)).arrayBuffer()), "full-source.png");
    e.confirmTransform();
    const pixel = (c, x) => Array.from(context(c).getImageData(x, 32, 1, 1).data);
    const hiddenRetained = pixel(e.layer.canvas, 48)[3] === 255 && pixel(composite(e.doc), 48)[3] === 0;
    e.beginTransform();
    const fullWidth = e.transform.source.width;
    e.updateTransform(e.transform.points.map(p => ({x:p.x-64,y:p.y})));
    e.confirmTransform();
    const restored = pixel(composite(e.doc), 16);
    const bitmap = await createImageBitmap(await toPNG(composite(e.doc)));
    const exported = canvas(64, 64);
    context(exported).drawImage(bitmap, 0, 0);
    bitmap.close();
    const exportMasked = pixel(exported, 48)[3] === 0 && pixel(exported, 16)[2] === 255;
    e.undo();
    const undoRed = pixel(composite(e.doc), 16)[0] === 255;
    e.redo();
    const redoBlue = pixel(composite(e.doc), 16)[2] === 255;
    e.beginTransform();
    e.updateTransform(e.transform.points.map(p => ({x:p.x+64,y:p.y})));
    e.confirmTransform();
    const movedBack = pixel(composite(e.doc), 16)[0] === 255;
    return {hiddenRetained, fullWidth, restored, exportMasked, undoRed, redoBlue, movedBack};
  });
  ok(retained.hiddenRetained, "Applied layer keeps pixels outside UV while composite hides them");
  ok(retained.fullWidth === 128 && retained.restored[2] === 255, "Repeated transform recovers source pixels originally outside the canvas");
  ok(retained.exportMasked, "Exported PNG uses the visibility mask");
  ok(retained.undoRed && retained.redoBlue && retained.movedBack, "Undo, redo and repeated moves retain full source and masking");
  await page.evaluate(async () => {
    const { editor: e } = await import("/src/core/editor.ts");
    const { canvas, context, toPNG } = await import("/src/core/canvas.ts");
    e.confirmTransform();
    await e.newCanvas(128, 128);
    const source = canvas(64, 64);
    context(source).fillStyle = "#ff0000";
    context(source).fillRect(0, 0, 64, 64);
    await e.importImage(new Uint8Array(await (await toPNG(source)).arrayBuffer()), "snap-fixture.png");
  });
  await page.getByTitle("Fit canvas", { exact: true }).click();
  g = await geometry();
  await page.keyboard.down("Control");
  await drag(screen({x:32,y:32}, g), screen({x:45,y:43}, g));
  await page.keyboard.up("Control");
  g = await geometry();
  ok(Math.abs(g.points[0].x-16)<.01 && Math.abs(g.points[0].y-8)<.01, "Ctrl-drag snaps movement to 8 texture pixels through actual pointer events");
  const pivot = {x:48,y:40}, radius = 32+28/g.z;
  const angle = 8*Math.PI/180;
  await page.keyboard.down("Control");
  await drag(screen({x:pivot.x,y:pivot.y-radius},g), screen({x:pivot.x+radius*Math.sin(angle),y:pivot.y-radius*Math.cos(angle)},g));
  await page.keyboard.up("Control");
  g = await geometry();
  const snappedAngle = Math.atan2(g.points[1].y-g.points[0].y,g.points[1].x-g.points[0].x)*180/Math.PI;
  ok(Math.abs(snappedAngle-10)<.01, "Ctrl rotation handle snaps 8 degree gesture to 10 degrees");
  await page.keyboard.press("Enter");
  await page.screenshot({ path: "test-results/05-interaction.png" });
  assert.deepEqual(errors, []);
  await writeFile(
    "test-results/interaction-results.json",
    JSON.stringify({ checks, errors }, null, 2),
  );
} finally {
  await app.close();
  await server.close();
}
