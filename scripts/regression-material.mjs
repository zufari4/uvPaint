import { _electron as electron } from "playwright";
import { createServer } from "vite";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const server = await createServer();
await server.listen();
const env = { ...process.env, UVPAINT_DEV_URL: "http://127.0.0.1:5173" };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ["."], env });
try {
  const page = await app.firstWindow();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.waitForSelector(".empty-canvas");
  const checks = await page.evaluate(async () => {
    const { editor: e } = await import("/src/core/editor.ts");
    const THREE = await import("/node_modules/three/build/three.module.js");
    const { GLTFExporter } =
      await import("/node_modules/three/examples/jsm/exporters/GLTFExporter.js");
    const { canvas, context } = await import("/src/core/canvas.ts");
    const { PaintStroke } = await import("/src/tools/paint.ts");
    const results = [];
    const ok = (condition, label) => {
      if (!condition) throw new Error(label);
      results.push(label);
    };
    const pixel = (c, x, y) => [...context(c).getImageData(x, y, 1, 1).data];
    const color = canvas(64, 64);
    context(color).fillStyle = "#a04020";
    context(color).fillRect(0, 0, 64, 64);
    context(color).fillStyle = "#2060d0";
    context(color).fillRect(32, 0, 32, 64);
    const alpha = canvas(64, 64);
    context(alpha).fillStyle = "#fff";
    context(alpha).fillRect(32, 0, 32, 64);
    const base = new THREE.CanvasTexture(color);
    base.channel = 1;
    base.name = "body-color";
    base.colorSpace = THREE.SRGBColorSpace;
    base.flipY = false;
    const ao = new THREE.CanvasTexture(alpha);
    ao.channel = 0;
    ao.name = "independent-alpha";
    ao.flipY = false;
    const material = new THREE.MeshStandardMaterial({
      map: base,
      aoMap: ao,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
    });
    material.name = "Body";
    const geometry = new THREE.PlaneGeometry(2, 2);
    const uv1 = geometry.getAttribute("uv").clone();
    for (let i = 0; i < uv1.count; i++) uv1.setX(i, 1 - uv1.getX(i));
    geometry.setAttribute("uv1", uv1);
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(geometry, material));
    const glb = await new GLTFExporter().parseAsync(scene, { binary: true });
    await e.importModel(new Uint8Array(glb), "material-regression.glb");
    const slot = e.model.slots[0];
    ok(
      e.doc.alphaMode === "MASK" &&
        !slot.preview.transparent &&
        slot.preview.alphaTest === 0.5,
      "MASK import preserves cutoff and disables blending",
    );
    ok(
      slot.sourceTextures.length === 2 &&
        slot.uvLabels.uv.includes("AO") &&
        slot.uvLabels.uv1.includes("Base Color"),
      "Texture roles label UV maps without inventing Blender names",
    );
    const version = slot.preview.version;
    const originalColor = e.output.toDataURL();
    e.selectUVSet("uv");
    ok(
      slot.texture.channel === 0 &&
        slot.preview.version > version &&
        e.doc.textureUsage === "AO" &&
        e.output.toDataURL() !== originalColor,
      "UV selection opens its linked AO image with matching preview mapping",
    );
    e.addEmpty();
    e.color = "#00ff00";
    e.tool = "brush";
    e.brushSize = 8;
    new PaintStroke(e, { x: 12, y: 12 }).finish();
    const aoEdited = e.output.toDataURL();
    e.selectUVSet("uv1");
    ok(
      e.output.toDataURL() === originalColor && e.doc.layers.length === 1,
      "Switching to Base Color preserves its separate layer stack",
    );
    e.selectUVSet("uv");
    ok(
      e.output.toDataURL() === aoEdited && e.doc.layers.length === 2,
      "Returning to AO restores its edited pixels and layers",
    );
    e.undo();
    ok(
      e.output.toDataURL() !== aoEdited && e.doc.textureUsage === "AO",
      "Undo applies only to the active texture",
    );
    e.redo();
    ok(e.output.toDataURL() === aoEdited, "Redo restores the AO stroke");
    e.selectUVSet("uv1");
    const before = e.output.toDataURL(),
      rgb = pixel(e.output, 8, 16);
    const index = slot.sourceTextures.findIndex((t) => t.usage === "AO");
    e.transferMaterialAlpha(index, "uv");
    ok(
      pixel(e.output, 8, 16)[3] === 255 && pixel(e.output, 48, 16)[3] === 0,
      "Alpha transfer uses independent source UV and destination UV",
    );
    ok(
      pixel(e.output, 8, 16)
        .slice(0, 3)
        .every((v, i) => v === rgb[i]),
      "Alpha transfer leaves visible RGB unchanged",
    );
    e.undo();
    ok(e.output.toDataURL() === before, "Alpha transfer is undoable");
    e.redo();
    ok(pixel(e.output, 48, 16)[3] === 0, "Alpha transfer is redoable");
    e.change("Opaque", (d) => {
      d.alphaMode = "OPAQUE";
    });
    ok(
      !slot.preview.transparent &&
        slot.preview.alphaTest === 0 &&
        !slot.studio.transparent,
      "Opaque mode ignores alpha in both preview materials",
    );
    e.change("Blend", (d) => {
      d.alphaMode = "BLEND";
    });
    ok(
      slot.preview.transparent &&
        slot.studio.transparent &&
        !slot.preview.depthWrite,
      "Blend mode uses transparent sorting without depth writes",
    );
    e.undo();
    ok(!slot.preview.transparent, "Alpha mode changes undo correctly");
    e.change("UV alias", (d) => {
      d.uvNames = { uv1: "Color UV" };
    });
    e.undo();
    ok(!e.doc.uvNames?.uv1, "UV aliases participate in history");
    e.redo();
    ok(e.doc.uvNames.uv1 === "Color UV", "UV alias redo");
    e.addEmpty();
    e.setTool("brush");
    e.brushSize = 10;
    e.color = "#ff00ff";
    const pointer = new PaintStroke(e, { x: 12, y: 12 });
    pointer.finish();
    ok(
      pixel(e.layer.canvas, 12, 12)[0] === 255 &&
        pixel(e.layer.canvas, 12, 12)[2] === 255,
      "Paint still modifies selected layer after UV and alpha edits",
    );
    const blocked = (change, expected) => {
      e.change("blocked brush fixture", change);
      let message = "";
      try {
        new PaintStroke(e, { x: 12, y: 12 });
      } catch (error) {
        message = error.message;
      }
      ok(message.includes(expected), `Brush explains ${expected}`);
      e.undo();
    };
    blocked((d) => {
      d.layers.find((l) => l.id === d.activeId).visible = false;
    }, "hidden");
    blocked((d) => {
      d.layers.find((l) => l.id === d.activeId).opacity = 0;
    }, "opacity");
    blocked((d) => {
      d.selection = canvas(64, 64);
    }, "selection is empty");
    blocked((d) => {
      d.restrict = true;
      d.islands = [];
    }, "no islands");
    e.deselect();
    e.tool = "brush";
    e.emit();
    return results;
  });
  checks.forEach((c) => console.log("PASS", c));
  // A space key released outside the app must not leave the brush in pan mode.
  await page.keyboard.down("Space");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.keyboard.up("Space");
  const box = await page.getByTestId("texture-canvas").boundingBox();
  const count = await page.evaluate(async () => {
    const { editor: e } = await import("/src/core/editor.ts");
    return e.history.undoStack.length;
  });
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2, {
    steps: 3,
  });
  await page.mouse.up();
  assert.ok(
    await page.evaluate(async (count) => {
      const { editor: e } = await import("/src/core/editor.ts");
      return e.history.undoStack.length > count;
    }, count),
  );
  console.log("PASS Brush works after pan modifier loses window focus");
  const dataBefore = await page.evaluate(async () => {
    const { editor: e } = await import("/src/core/editor.ts");
    return e.output.toDataURL();
  });
  await page.getByLabel("Preview shading").selectOption("unlit");
  await page.getByLabel("Show model edges").check();
  await page.getByLabel("Preview shading").selectOption("studio");
  assert.equal(
    await page.evaluate(async () => {
      const { editor: e } = await import("/src/core/editor.ts");
      return e.output.toDataURL();
    }),
    dataBefore,
  );
  console.log("PASS Lighting and edges never change document pixels");
  assert.deepEqual(errors, []);
  await mkdir("test-results", { recursive: true });
  await writeFile(
    "test-results/material-regression.json",
    JSON.stringify({ passed: checks.length + 2, checks, errors }, null, 2),
  );
} finally {
  await app.close();
  await server.close();
}
