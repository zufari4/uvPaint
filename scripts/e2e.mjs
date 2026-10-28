import { _electron as electron } from "playwright";
import { createServer } from "vite";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const server = await createServer();
await server.listen();
const env = { ...process.env, UVPAINT_DEV_URL: "http://127.0.0.1:5173" };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ["."], env });
const page = await app.firstWindow();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await mkdir("test-results", { recursive: true });
try {
  await page.waitForSelector(".empty-canvas");
  await page.screenshot({ path: "test-results/01-empty.png" });
  const results = await page.evaluate(async () => {
    const { editor: e } = await import("/src/core/editor.ts");
    const THREE = await import("/node_modules/three/build/three.module.js");
    const { GLTFExporter } =
      await import("/node_modules/three/examples/jsm/exporters/GLTFExporter.js");
    const { canvas, context, toPNG } = await import("/src/core/canvas.ts");
    const { composite } = await import("/src/render/composite.ts");
    const { polygonMask, floodMask } = await import("/src/tools/selection.ts");
    const { PaintStroke } = await import("/src/tools/paint.ts");
    const { homography, mapPoint } = await import("/src/tools/homography.ts");
    const log = [];
    function check(ok, msg) {
      if (!ok) throw new Error(msg);
      log.push(msg);
    }
    const pixel = (c, x, y) => [...context(c).getImageData(x, y, 1, 1).data];
    const near = (a, b, t = 2) => a.every((v, i) => Math.abs(v - b[i]) <= t);
    // Build and encode a real embedded-texture GLB, then run the production importer.
    const img = canvas(64, 64),
      ctx = context(img);
    ctx.fillStyle = "#e04020";
    ctx.fillRect(0, 0, 32, 64);
    ctx.fillStyle = "rgba(20,160,220,.5)";
    ctx.fillRect(32, 0, 32, 64);
    const texture = new THREE.CanvasTexture(img);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = false;
    const a = new THREE.MeshStandardMaterial({
      map: texture,
      transparent: true,
    });
    a.name = "Paint";
    const b = new THREE.MeshStandardMaterial({ color: "#8899aa" });
    b.name = "Blank";
    const scene = new THREE.Scene();
    const geometry = new THREE.PlaneGeometry(2, 2, 2, 2);
    geometry.setAttribute("uv1", geometry.getAttribute("uv").clone());
    const first = new THREE.Mesh(geometry, a);
    first.name = "Panel";
    const second = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), b);
    second.position.x = 2;
    second.name = "Trim";
    scene.add(first, second);
    const glb = await new GLTFExporter().parseAsync(scene, { binary: true });
    await e.importModel(new Uint8Array(glb), "Acceptance fixture.glb");
    check(
      e.model.slots.length === 2 && e.model.parts.length === 2,
      "GLB import: multiple materials and meshes",
    );
    check(
      e.doc.width === 64 && e.doc.height === 64,
      "Embedded texture dimensions preserved",
    );
    check(e.model.slots[0].uvSets.includes("uv1"), "Multiple UV sets detected");
    check(e.doc.islands.length > 0, "UV islands extracted");
    check(
      near(pixel(e.output, 10, 10), [224, 64, 32, 255]),
      "Embedded base-color pixels preserved",
    );
    check(
      Math.abs(pixel(e.output, 40, 10)[3] - 128) <= 1,
      "Embedded alpha preserved",
    );
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.setClearColor(0, 0);
    renderer.setSize(64, 64, false);
    const previewScene = new THREE.Scene();
    const previewGeometry = new THREE.PlaneGeometry(2, 2);
    const previewUV = previewGeometry.getAttribute("uv");
    for (let i = 0; i < previewUV.count; i++)
      previewUV.setY(i, 1 - previewUV.getY(i));
    previewScene.add(new THREE.Mesh(previewGeometry, e.model.slots[0].preview));
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 1;
    renderer.render(previewScene, camera);
    const renderedPreview = canvas(64, 64);
    context(renderedPreview).drawImage(renderer.domElement, 0, 0);
    check(
      near(pixel(renderedPreview, 10, 10), pixel(e.output, 10, 10), 2),
      "Unlit 3D rendering matches sRGB composite",
    );
    check(
      near(pixel(renderedPreview, 42, 10), pixel(e.output, 42, 10), 3),
      "Unlit 3D rendering preserves color and partial alpha",
    );
    renderer.dispose();
    previewGeometry.dispose();
    const firstId = e.activeId,
      secondId = e.model.slots[1].id;
    const initial = e.output.toDataURL();
    e.selectMaterial(secondId);
    check(
      e.doc.layers[0].name === "Empty canvas",
      "Untextured material offers empty canvas",
    );
    await e.newCanvas(64, 64);
    e.addEmpty();
    const secondCount = e.doc.layers.length;
    e.selectMaterial(firstId);
    check(
      e.output.toDataURL() === initial,
      "Material switching preserves texture",
    );
    const mask = polygonMask(64, 64, [
      { x: 0, y: 0 },
      { x: 24, y: 0 },
      { x: 24, y: 64 },
      { x: 0, y: 64 },
    ]);
    e.setSelection(mask);
    e.copy(false, true);
    check(
      e.doc.layers.length === 2 &&
        pixel(e.layer.canvas, 10, 10)[3] === 255 &&
        pixel(e.layer.canvas, 30, 10)[3] === 0,
      "Selection extraction creates precise fragment",
    );
    check(
      pixel(e.doc.layers[0].canvas, 10, 10)[3] === 0,
      "Extraction removes pixels from source layer",
    );
    e.undo();
    check(
      e.doc.layers.length === 1 && pixel(e.layer.canvas, 10, 10)[3] === 255,
      "Undo restores extracted pixels and layer count",
    );
    e.redo();
    check(e.doc.layers.length === 2, "Redo restores fragment");
    e.beginTransform();
    const original = e.transform.source.toDataURL();
    const points = [
      { x: 5, y: 3 },
      { x: 54, y: 12 },
      { x: 43, y: 59 },
      { x: 13, y: 48 },
    ];
    e.updateTransform(points);
    check(
      e.transform.source.toDataURL() === original,
      "Perspective drag retains immutable source",
    );
    check(
      pixel(e.layer.canvas, 25, 25)[3] > 250 &&
        pixel(e.layer.canvas, 1, 1)[3] === 0,
      "GPU perspective writes only transformed quad",
    );
    const warped = e.layer.canvas.toDataURL();
    e.updateTransform(points.map((p) => ({ x: p.x + 2, y: p.y })));
    e.updateTransform(points);
    check(
      e.layer.canvas.toDataURL() === warped,
      "Repeated drags do not accumulate resampling",
    );
    e.cancelTransform();
    check(
      pixel(e.layer.canvas, 10, 10)[3] === 255,
      "Escape restores pre-transform pixels",
    );
    e.beginTransform();
    e.updateTransform(points);
    e.confirmTransform();
    e.undo();
    check(
      pixel(e.layer.canvas, 10, 10)[3] === 255,
      "Transform is one undoable operation",
    );
    e.redo();
    e.beginTransform("mesh");
    const meshPoints = e.transform.points.map((p) => ({ ...p }));
    meshPoints[5].x += 7;
    e.updateTransform(meshPoints);
    check(
      e.transform.points.length === 16,
      "Mesh warp exposes 16 editable control points",
    );
    e.confirmTransform();
    // Analytic homography reference sampled from a two-dimensional gradient.
    const gradient = canvas(64, 64);
    const data = context(gradient).createImageData(64, 64);
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++)
        data.data.set([x * 4, y * 4, 80, 128], (y * 64 + x) * 4);
    context(gradient).putImageData(data, 0, 0);
    const quad = [
      { x: 4, y: 4 },
      { x: 59, y: 12 },
      { x: 46, y: 60 },
      { x: 14, y: 48 },
    ];
    const rendered = e.warp.render(gradient, quad, "perspective", 64, 64);
    const inv = homography(quad, [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ]);
    for (const p of [
      { x: 25, y: 20 },
      { x: 30, y: 35 },
      { x: 37, y: 42 },
    ]) {
      const uv = mapPoint(inv, { x: p.x + 0.5, y: p.y + 0.5 });
      check(
        near(
          pixel(rendered, p.x, p.y),
          [(uv.x * 64 - 0.5) * 4, (uv.y * 64 - 0.5) * 4, 80, 128],
          4,
        ),
        `True projective gradient + straight alpha at ${p.x},${p.y}`,
      );
    }
    const edgeSource = canvas(16, 16);
    context(edgeSource).fillStyle = "#ff0000";
    context(edgeSource).fillRect(0, 0, 8, 16);
    const edgeQuad = [
      { x: 0.5, y: 0 },
      { x: 16.5, y: 0 },
      { x: 16.5, y: 16 },
      { x: 0.5, y: 16 },
    ];
    const edgeResult = e.warp.render(
      edgeSource,
      edgeQuad,
      "perspective",
      32,
      32,
    );
    check(
      near(pixel(edgeResult, 8, 6), [255, 0, 0, 128], 2),
      "Perspective filtering preserves saturated color at transparent cut edges",
    );
    const edgeGrid = Array.from({ length: 16 }, (_, i) => ({
      x: 0.5 + ((i % 4) * 16) / 3,
      y: (Math.floor(i / 4) * 16) / 3,
    }));
    const meshEdgeResult = e.warp.render(edgeSource, edgeGrid, "mesh", 32, 32);
    check(
      near(pixel(meshEdgeResult, 8, 6), [255, 0, 0, 128], 2),
      "Mesh filtering preserves saturated color at transparent cut edges",
    );
    // Install a known UV region to verify every edit is clipped geometrically.
    e.change("test islands", (d) => {
      d.islands = [
        {
          id: 0,
          triangles: [
            [
              { x: 0, y: 0 },
              { x: 0.5, y: 0 },
              { x: 0, y: 1 },
            ],
            [
              { x: 0.5, y: 0 },
              { x: 0.5, y: 1 },
              { x: 0, y: 1 },
            ],
          ],
        },
      ];
      d.selectedIslands = [0];
      d.restrict = true;
      d.selection = null;
    });
    e.addEmpty();
    e.tool = "brush";
    e.color = "#00ff00";
    e.brushSize = 30;
    const stroke = new PaintStroke(e, { x: 30, y: 32 });
    stroke.draw({ x: 45, y: 32 });
    stroke.finish();
    check(
      pixel(e.layer.canvas, 25, 32)[1] === 255 &&
        pixel(e.layer.canvas, 40, 32)[3] === 0,
      "UV clipping restricts brush strokes",
    );
    e.fill({ x: 5, y: 5 });
    check(
      pixel(e.layer.canvas, 4, 4)[1] === 255 &&
        pixel(e.layer.canvas, 48, 4)[3] === 0,
      "UV clipping restricts fills",
    );
    e.beginTransform();
    e.updateTransform([
      { x: 20, y: 0 },
      { x: 60, y: 0 },
      { x: 60, y: 64 },
      { x: 20, y: 64 },
    ]);
    e.confirmTransform();
    check(
      pixel(composite({ ...e.doc, layers: [e.layer] }), 40, 30)[3] === 0 &&
        pixel(e.layer.canvas, 40, 30)[3] > 0,
      "UV mask hides transformed pixels without deleting them",
    );
    e.change("disable restriction", (d) => {
      d.restrict = false;
    });
    const wand = floodMask(img, 2, 2, 0, true);
    check(
      pixel(wand, 2, 2)[3] === 255 && pixel(wand, 40, 2)[3] === 0,
      "Contiguous magic wand respects color boundary",
    );
    const all = floodMask(img, 2, 2, 0, false);
    check(
      pixel(all, 2, 50)[3] === 255,
      "Non-contiguous magic wand selects matching colors",
    );
    const beforeSelection = e.doc.selection;
    e.setSelection(mask);
    e.invert();
    check(
      pixel(e.doc.selection, 2, 2)[3] === 0 &&
        pixel(e.doc.selection, 40, 2)[3] === 255,
      "Selection inversion",
    );
    e.deselect();
    e.undo();
    check(e.doc.selection !== null, "Selection changes are undoable");
    e.deselect();
    e.copy();
    e.paste();
    check(e.layer.name === "Pasted fragment", "Copy and paste");
    e.duplicateLayer();
    const n = e.doc.layers.length;
    e.reorder(-1);
    e.updateLayer(e.layer.id, { opacity: 0.5, blend: "multiply" });
    e.deleteLayer();
    e.undo();
    check(e.doc.layers.length === n, "Layer operations participate in undo");
    e.selectMaterial(secondId);
    check(
      e.doc.layers.length === secondCount,
      "Material layer stacks remain independent",
    );
    e.undo();
    check(
      e.doc.layers.length === secondCount - 1,
      "Undo histories are material-local",
    );
    e.selectMaterial(firstId);
    const clean = composite(e.doc);
    const blob = await toPNG(clean);
    const bitmap = await createImageBitmap(blob);
    const decoded = canvas(bitmap.width, bitmap.height);
    context(decoded).drawImage(bitmap, 0, 0);
    bitmap.close();
    check(
      near(pixel(decoded, 22, 30), pixel(clean, 22, 30), 1),
      "Exported PNG matches composite pixels",
    );
    check(
      e.model.slots[0].texture.image === e.output,
      "Live preview uses the same composite as texture canvas",
    );
    e.uvDisplay = "off";
    e.emit();
    check(
      composite(e.doc).toDataURL() === clean.toDataURL(),
      "UV visibility never changes export",
    );
    let rejected = false;
    try {
      await e.newCanvas(e.warp.maxSize + 1, 2);
    } catch {
      rejected = true;
    }
    check(
      rejected && e.doc.width === 64,
      "Oversized GPU allocation fails without downscaling or mutation",
    );
    e.addEmpty();
    e.color = "#a020f0";
    e.brushSize = 8;
    e.brushOpacity = 1;
    e.tool = "brush";
    const paint = new PaintStroke(e, { x: 12, y: 12 });
    paint.draw({ x: 20, y: 12 });
    paint.finish();
    check(
      near(pixel(e.layer.canvas, 12, 12), [160, 32, 240, 255]),
      "Brush paints exact selected color",
    );
    e.pickColor({ x: 12, y: 12 });
    check(e.color === "#a020f0", "Eyedropper samples composite");
    e.tool = "clone";
    e.cloneSource = { x: 12, y: 12 };
    const stamp = new PaintStroke(e, { x: 42, y: 42 });
    stamp.finish();
    check(
      near(pixel(e.layer.canvas, 42, 42), [160, 32, 240, 255]),
      "Clone stamp copies selected source",
    );
    e.tool = "eraser";
    const erase = new PaintStroke(e, { x: 42, y: 42 });
    erase.finish();
    check(pixel(e.layer.canvas, 42, 42)[3] === 0, "Eraser removes alpha");
    e.undo();
    check(
      pixel(e.layer.canvas, 42, 42)[3] === 255,
      "Eraser undo restores pixels",
    );
    e.setSelection(
      polygonMask(64, 64, [
        { x: 8, y: 8 },
        { x: 24, y: 8 },
        { x: 16, y: 18 },
        { x: 24, y: 24 },
        { x: 8, y: 24 },
      ]),
    );
    e.copy(true);
    check(
      pixel(e.layer.canvas, 12, 12)[3] === 0,
      "Polygon selection cuts selected pixels",
    );
    e.paste();
    check(
      pixel(e.layer.canvas, 12, 12)[3] === 255,
      "Pasted cut fragment retains alpha",
    );
    const large = canvas(128, 128);
    context(large).fillStyle = "#f0d010";
    context(large).fillRect(0, 0, 128, 128);
    const imported = await toPNG(large);
    await e.importImage(
      new Uint8Array(await imported.arrayBuffer()),
      "Large image.png",
    );
    check(
      e.transform.source.width === 128,
      "Image placement retains source outside canvas",
    );
    e.adjustTransform(0.5, 0.5);
    e.updateTransform([
      { x: 0, y: 0 },
      { x: 64, y: 0 },
      { x: 64, y: 64 },
      { x: 0, y: 64 },
    ]);
    e.confirmTransform();
    check(
      near(pixel(e.layer.canvas, 62, 62), [240, 208, 16, 255]),
      "Large image can be scaled into canvas without cropping source",
    );
    e.adjustTransform(-1, 1);
    e.confirmTransform();
    check(
      pixel(e.layer.canvas, 32, 32)[3] === 255,
      "Horizontal flip works with projective mapping",
    );
    e.adjustTransform(1, -1, 45);
    e.cancelTransform();
    const { islandMask } = await import("/src/tools/uv.ts");
    const triangle = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ];
    const union = islandMask({
      ...e.doc,
      islands: [
        { id: 0, triangles: [triangle] },
        { id: 1, triangles: [[...triangle].reverse()] },
      ],
      selectedIslands: [0, 1],
    });
    check(
      pixel(union, 8, 8)[3] === 255,
      "Mirrored overlapping UV islands form a union without cancellation",
    );
    const left = polygonMask(64, 64, [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 64 },
      { x: 0, y: 64 },
    ]);
    const right = polygonMask(64, 64, [
      { x: 40, y: 0 },
      { x: 64, y: 0 },
      { x: 64, y: 64 },
      { x: 40, y: 64 },
    ]);
    e.setSelection(left, "replace");
    e.setSelection(right, "add");
    check(
      pixel(e.doc.selection, 8, 8)[3] === 255 &&
        pixel(e.doc.selection, 50, 8)[3] === 255,
      "Selection addition preserves disjoint regions",
    );
    e.setSelection(left, "subtract");
    check(
      pixel(e.doc.selection, 8, 8)[3] === 0 &&
        pixel(e.doc.selection, 50, 8)[3] === 255,
      "Selection subtraction removes only requested region",
    );
    e.deselect();
    const bottom = canvas(64, 64),
      top = canvas(64, 64);
    context(bottom).fillStyle = "rgb(100,150,200)";
    context(bottom).fillRect(0, 0, 64, 64);
    context(top).fillStyle = "rgb(200,80,40)";
    context(top).fillRect(0, 0, 64, 64);
    const base = e.makeLayer(bottom, "Bottom"),
      upper = e.makeLayer(top, "Top");
    for (const [blend, expected] of [
      ["source-over", [200, 80, 40, 255]],
      ["multiply", [78, 47, 31, 255]],
      ["screen", [222, 183, 209, 255]],
      ["overlay", [157, 111, 162, 255]],
      ["darken", [100, 80, 40, 255]],
      ["lighten", [200, 150, 200, 255]],
    ]) {
      const blended = composite({
        ...e.doc,
        layers: [base, { ...upper, blend }],
      });
      check(
        near(pixel(blended, 8, 8), expected, 1),
        `Blend mode ${blend} matches reference formula`,
      );
    }
    e.change("test layer merge", (d) => {
      d.layers = [base, upper];
      d.activeId = upper.id;
    });
    const mergeBefore = pixel(e.output, 8, 8);
    e.mergeDown();
    check(
      e.doc.layers.length === 1 && near(pixel(e.output, 8, 8), mergeBefore, 0),
      "Normal merge down preserves composite",
    );
    e.undo();
    check(e.doc.layers.length === 2, "Undo merge restores source layers");
    await e.newCanvas(96, 80);
    check(
      e.doc.width === 96 && e.layer.canvas.height === 80,
      "Custom non-square texture resize",
    );
    e.undo();
    check(
      e.doc.width === 64 && e.doc.height === 64,
      "Undo resize restores original dimensions",
    );
    await e.sample();
    check(
      e.doc.islands.reduce((sum, i) => sum + i.triangles.length, 0) === 12,
      "Single-material geometry includes all UV geometry groups",
    );
    check(
      e.doc.islands.length > 1,
      "Overlapping but disconnected UV islands remain separate",
    );
    e.uvDisplay = "triangles";
    e.tool = "move";
    e.color = "#f06b4f";
    e.emit();
    return log;
  });
  results.forEach((r) => console.log("PASS", r));
  assert.equal(errors.length, 0, errors.join("\n"));
  await page.waitForTimeout(600);
  await page.screenshot({ path: "test-results/02-sample.png" });
  // Exercise the actual pointer wiring for selection, extraction and four-corner dragging.
  await page
    .getByRole("button", { name: "Rectangle selection (M)", exact: true })
    .click();
  const box = await page.getByTestId("texture-canvas").boundingBox();
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.35);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.65, {
    steps: 8,
  });
  await page.mouse.up();
  await page.keyboard.press("Control+j");
  await page
    .getByRole("button", { name: "Move / transform (V)", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Four-corner perspective", exact: true })
    .click();
  assert.equal(
    await page.evaluate(async () => {
      const { editor: e } = await import("/src/core/editor.ts");
      return e.transform?.kind;
    }),
    "perspective",
  );
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.35);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.44, box.y + box.height * 0.3, {
    steps: 8,
  });
  await page.mouse.up();
  await page.screenshot({ path: "test-results/03-transform.png" });
  await page.keyboard.press("Enter");
  await page
    .getByRole("button", { name: "Application menu", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Help", exact: true }).click();
  assert.equal(await page.locator(".help-modal").count(), 1);
  await page.getByRole("button", { name: "Close help", exact: true }).click();
  const security = await page.evaluate(() => ({
    node: typeof window.require,
    bridge: typeof window.desktop?.openFile,
    rawIPC: typeof window.desktop?.send,
  }));
  assert.deepEqual(security, {
    node: "undefined",
    bridge: "function",
    rawIPC: "undefined",
  });
  console.log("PASS Secure preload: no Node.js or generic IPC in renderer");
  const savePath = path.resolve("test-results/native-export.png");
  await app.evaluate(({ dialog }, target) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
  }, savePath);
  await page.getByTitle("Application menu", {exact:true}).click();
  await page
    .getByRole("menuitem", { name: "Export PNG", exact: true })
    .click();
  await page.waitForFunction(() =>
    document.querySelector(".notice-toast")?.textContent?.includes("Exported"),
  );
  const png = await readFile(savePath);
  assert.equal(png.readUInt32BE(0), 0x89504e47);
  console.log("PASS Native PNG dialog/IPC writes real PNG file");
  const diff = await page.evaluate(async (base64) => {
    const { editor: e } = await import("/src/core/editor.ts");
    const { canvas, context } = await import("/src/core/canvas.ts");
    const blob = new Blob(
      [Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))],
      { type: "image/png" },
    );
    const bitmap = await createImageBitmap(blob);
    const c = canvas(bitmap.width, bitmap.height);
    context(c).drawImage(bitmap, 0, 0);
    bitmap.close();
    const actual = context(c).getImageData(0, 0, c.width, c.height).data,
      expected = context(e.output).getImageData(0, 0, c.width, c.height).data;
    let different = 0,
      max = 0;
    for (let i = 0; i < actual.length; i++) {
      const delta = Math.abs(actual[i] - expected[i]);
      if (delta) {
        different++;
        max = Math.max(max, delta);
      }
    }
    return { different, max };
  }, png.toString("base64"));
  assert.ok(diff.max <= 1, `Export pixel mismatch: ${JSON.stringify(diff)}`);
  console.log(
    "PASS Native exported PNG matches all composite pixels (max channel delta " +
      diff.max +
      ")",
  );
  assert.equal(errors.length, 0, errors.join("\n"));
  await writeFile(
    "test-results/results.json",
    JSON.stringify(
      { passed: results.length + 5, checks: results, errors },
      null,
      2,
    ),
  );
  console.log(`PASS ${results.length + 5} acceptance checks`);
} finally {
  await app.close();
  await server.close();
}
