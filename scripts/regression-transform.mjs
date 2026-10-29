import { _electron as electron } from "playwright";
import { createServer } from "vite";
import assert from "node:assert/strict";

const server = await createServer();
await server.listen();
const env = { ...process.env, UVPAINT_DEV_URL: "http://127.0.0.1:5173" };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ["."], env });
try {
  const page = await app.firstWindow();
  await page.waitForSelector(".empty-canvas");
  const result = await page.evaluate(async () => {
    const { Editor, editor: live } = await import("/src/core/editor.ts");
    const { canvas, context, toPNG } = await import("/src/core/canvas.ts");
    const { polygonMask } = await import("/src/tools/selection.ts");
    const { composite } = await import("/src/render/composite.ts");
    const checks = [];
    const check = (ok, label) => {
      if (!ok) throw new Error(label);
      checks.push(label);
    };
    const pixel = (c, x, y = 32) => [...context(c).getImageData(x, y, 1, 1).data];
    const e = new Editor();
    await e.newCanvas(64, 64);
    e.doc.restrict = true;
    e.doc.islands = [{ id: 0, triangles: [
      [{ x: 0, y: 0 }, { x: .5, y: 0 }, { x: 0, y: 1 }],
      [{ x: .5, y: 0 }, { x: .5, y: 1 }, { x: 0, y: 1 }],
    ] }];
    const source = canvas(64, 64);
    context(source).fillStyle = "#ff0000";
    context(source).fillRect(0, 0, 64, 64);
    await e.importImage(new Uint8Array(await (await toPNG(source)).arrayBuffer()), "copy-fixture.png");
    e.confirmTransform();
    const originalId = e.layer.id;
    const selectHidden = () => e.setSelection(polygonMask(64, 64, [
      {x:40,y:4}, {x:56,y:4}, {x:56,y:60}, {x:40,y:60},
    ]));
    selectHidden();
    e.copy();
    check(pixel(e.clipboard, 48)[3] === 255 && pixel(e.clipboard, 8)[3] === 0,
      "Copy uses the selection only, retaining pixels hidden by UV masking");
    e.paste();
    check(pixel(e.layer.canvas, 48)[3] === 255 && pixel(composite({...e.doc,layers:[e.layer]}),48)[3] === 0,
      "Paste retains hidden pixels and applies the visibility mask separately");
    e.beginTransform();
    e.updateTransform(e.transform.points.map(p => ({x:p.x-32,y:p.y})));
    e.confirmTransform();
    check(pixel(composite({...e.doc,layers:[e.layer]}),16)[3] === 255,
      "Copied hidden fragment becomes visible when moved onto an island");
    e.selectLayer(originalId);
    selectHidden();
    e.copy(true);
    check(pixel(e.layer.canvas,48)[3] === 0 && pixel(e.clipboard,48)[3] === 255,
      "Cut removes and copies selected pixels outside UV islands");
    e.undo();
    check(pixel(e.layer.canvas,48)[3] === 255, "Undo restores cut hidden pixels");
    e.copy(false,true);
    check(pixel(e.layer.canvas,48)[3] === 255 && e.layer.uvMask !== null,
      "Extract preserves hidden pixels in a new masked layer");
    e.selectLayer(originalId);
    e.deselect();
    e.copy();
    check(pixel(e.clipboard,60)[3] === 255, "Copy without a selection includes the full layer");

    const before = e.layer.canvas.toDataURL();
    e.beginTransform();
    const base = e.transform.points.map(p => ({...p}));
    let notifications = 0;
    const unsubscribe = e.subscribe(() => notifications++);
    for (let i=1;i<=20;i++) e.scheduleTransform(base.map(p => ({x:p.x+i,y:p.y})));
    check(notifications === 0, "Pointer bursts defer rendering until the next animation frame");
    await new Promise(requestAnimationFrame);
    check(notifications === 1 && e.transform.points[0].x === base[0].x+20,
      "A pointer burst renders only its latest position once per frame");
    const committed = base.map(p => ({x:p.x+24,y:p.y}));
    e.scheduleTransform(committed);
    e.confirmTransform();
    check(e.layer.placement.points[0].x === committed[0].x,
      "Applying a transform flushes the final pending pointer position");
    const saved = e.layer.canvas.toDataURL();
    e.beginTransform();
    e.scheduleTransform(base.map(p => ({x:p.x+48,y:p.y})));
    e.cancelTransform();
    await new Promise(requestAnimationFrame);
    check(e.layer.canvas.toDataURL() === saved, "Cancel discards queued transforms without changing committed pixels");
    e.undo();
    check(e.layer.canvas.toDataURL() === before, "Reused preview buffers leave undo snapshots intact");
    unsubscribe();

    const perf = new Editor();
    await perf.newCanvas(2048,2048);
    perf.doc.restrict = true;
    perf.doc.islands = e.doc.islands;
    const large = canvas(2048,2048);
    context(large).fillStyle = "#ff4400";
    context(large).fillRect(0,0,2048,2048);
    await perf.importImage(new Uint8Array(await (await toPNG(large)).arrayBuffer()), "performance.png");
    const origin = perf.transform.points.map(p=>({...p}));
    const samples = [];
    let allocations = 0;
    const create = document.createElement.bind(document);
    document.createElement = (...args) => {
      if (args[0] === "canvas") allocations++;
      return create(...args);
    };
    try {
      for(let i=0;i<12;i++) {
        await new Promise(requestAnimationFrame);
        const start = performance.now();
        perf.updateTransform(origin.map(p=>({x:p.x+i*3,y:p.y+i*2})));
        samples.push(performance.now()-start);
      }
    } finally { document.createElement = create; }
    check(allocations === 0, "Moving a 2048px texture reuses buffers without allocating full-size canvases");
    check(pixel(perf.layer.canvas,1500,1024)[3] === 255 && pixel(perf.output,1500,1024)[3] === 0,
      "Optimized rendering keeps full source pixels and masked output at native resolution");
    const projective = origin.map(p => ({...p}));
    projective[0].x = 50;
    perf.updateTransform(projective);
    const programs = perf.warp.renderer.info.programs.slice();
    perf.updateTransform(projective.map(p => ({x:p.x+5,y:p.y+3})));
    check(programs.length > 0 && programs.length === perf.warp.renderer.info.programs.length &&
      programs.every((p,i) => p === perf.warp.renderer.info.programs[i]),
      "Perspective movement reuses compiled shader programs");

    await live.sample();
    await live.newCanvas(2048,2048);
    live.selectIsland(live.doc.islands[0].id);
    live.setIslandVisibility("isolate");
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    const previewGeometry = live.model.parts.map(part => ({ geometry: part.geometry, index: part.geometry.index }));
    await live.importImage(new Uint8Array(await (await toPNG(large)).arrayBuffer()), "preview-fixture.png");
    live.setLayerIsland(live.doc.islands[0].id);
    live.beginTransform();
    const slot = () => live.model.slots.find(s => s.id === live.activeId);
    live.scheduleTransform(live.transform.points.map(p => ({x:p.x+8,y:p.y})));
    await new Promise(requestAnimationFrame);
    check(slot().texture.image.width === 512 && live.output.width === 2048 && live.layer.canvas.width === 2048,
      "Only the interactive 3D preview is reduced; 2D pixels remain at native resolution");
    live.flushTransform();
    check(slot().texture.image.width === 2048 && slot().texture.image === live.output,
      "Mouse release restores the full-resolution 3D texture");
    live.scheduleTransform(live.transform.points.map(p => ({x:p.x+8,y:p.y})));
    await new Promise(requestAnimationFrame);
    live.confirmTransform();
    check(slot().texture.image.width === 2048 && live.output.width === 2048,
      "Applying a transform keeps full-resolution output after interactive preview");
    await new Promise(requestAnimationFrame);
    check(live.model.parts.every((part,i) => part.geometry === previewGeometry[i].geometry && part.geometry.index === previewGeometry[i].index),
      "Selection and isolation keep preview geometry cached during 2048px transforms");
    check(live.layer.uvBinding.island.id === live.doc.islands[0].id,
      "2048px transforms keep the per-layer island binding");
    return { checks, meanMs: samples.reduce((a,b)=>a+b)/samples.length, samples };
  });
  assert.ok(result.checks.length >= 18);
  result.checks.forEach(label => console.log("PASS", label));
  console.log(`2048px move: ${result.meanMs.toFixed(2)} ms average CPU update`);
  await page.evaluate(async()=>{
    const {editor:e}=await import('/src/core/editor.ts');
    const {canvas,context,toPNG}=await import('/src/core/canvas.ts');
    e.cancelTransform();await e.newCanvas(128,128);
    const image=canvas(48,32);context(image).fillStyle='#e95b40';context(image).fillRect(0,0,48,32);
    await e.importImage(new Uint8Array(await (await toPNG(image)).arrayBuffer()),'frame.png');e.confirmTransform();e.setTool('brush');
  });
  const transformButton=page.getByTitle('Move / transform (V)',{exact:true});
  await transformButton.click();
  assert.ok(await page.evaluate(async()=>{const {editor:e}=await import('/src/core/editor.ts');window.testTransform=e.transform;window.testHistory=e.history.undoStack.length;return e.tool==='move'&&e.transform?.points.length===4&&e.transform.source.width===48&&e.transform.source.height===32;}));
  assert.ok(await page.getByTitle('Apply transform (Enter)',{exact:true}).isVisible());
  console.log('PASS Clicking Transform immediately opens the frame around layer content');
  await transformButton.click();
  assert.ok(await page.evaluate(async()=>{const {editor:e}=await import('/src/core/editor.ts');return e.transform===window.testTransform&&e.history.undoStack.length===window.testHistory;}));
  console.log('PASS Clicking the active Transform button preserves its frame and undo history');
  await page.getByTestId('texture-canvas').focus();await page.keyboard.press('Escape');await page.keyboard.press('KeyV');
  assert.ok(await page.evaluate(async()=>{const {editor:e}=await import('/src/core/editor.ts');return !!e.transform;}));
  console.log('PASS V also opens the transform frame after cancellation');
  await page.getByTestId('texture-canvas').click({position:{x:6,y:6}});
  assert.ok(await page.evaluate(async()=>{const {editor:e}=await import('/src/core/editor.ts');return !e.transform&&!e.doc.selectedIslands.length&&!e.doc.selection;}));
  console.log('PASS A blank click outside the frame clears selection instead of starting rotation');
  await page.keyboard.press('Escape');await transformButton.click();
  assert.ok(await page.evaluate(async()=>{const {editor:e}=await import('/src/core/editor.ts');return !!e.transform;}));
  await page.getByTitle('Brush (B)',{exact:true}).click();
  assert.ok(await page.evaluate(async()=>{const {editor:e}=await import('/src/core/editor.ts');return e.tool==='brush'&&!e.transform;}));
  console.log('PASS Re-entering Transform works and another tool closes the frame');
} finally {
  await app.close();
  await server.close();
}
