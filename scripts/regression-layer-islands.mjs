import { _electron as electron } from "playwright";
import { createServer } from "vite";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
const server = await createServer();
await server.listen();
const env = { ...process.env, UVPAINT_DEV_URL: "http://127.0.0.1:5173" };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: [".", `--user-data-dir=${process.cwd()}/test-results/layer-islands-profile`], env });
const check = (value, label) => { assert.ok(value, label); console.log("PASS", label); };
try {
  const page = await app.firstWindow(), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.waitForSelector(".empty-canvas");
  const results = await page.evaluate(async () => {
    const { Editor } = await import("/src/core/editor.ts");
    const { canvas, context, toPNG } = await import("/src/core/canvas.ts");
    const { PaintStroke } = await import("/src/tools/paint.ts");
    const { editingMask } = await import("/src/tools/uv.ts");
    const e = new Editor(), checks = [];
    const ok = (v, label) => { if (!v) throw new Error(label); checks.push(label); };
    const pixel = (c, x) => [...context(c).getImageData(x, 32, 1, 1).data];
    await e.newCanvas(64, 64);
    e.doc.restrict = true;
    e.doc.islands = [0,1].map(id => {
      const a = id / 2, b = a + .5;
      return { id, triangles: [[{x:a,y:0},{x:b,y:0},{x:b,y:1}],[{x:a,y:0},{x:b,y:1},{x:a,y:1}]] };
    });
    context(e.layer.canvas).fillStyle = "#ff0000";
    context(e.layer.canvas).fillRect(0,0,64,64);
    const source = e.layer.canvas, first = e.layer.id;
    e.setLayerIsland(0);
    ok(pixel(e.output,16)[3] === 255 && pixel(e.output,48)[3] === 0 && e.layer.canvas === source,
      "Layer binding masks output non-destructively, retaining the full source");
    const bitmap = await createImageBitmap(await toPNG(e.output)), exported = canvas(64,64);
    context(exported).drawImage(bitmap,0,0);bitmap.close();
    ok(pixel(exported,16)[3] === 255 && pixel(exported,48)[3] === 0,
      "Exported PNG includes the layer island mask without altering source pixels");
    const mask = e.layer.uvMask;
    e.selectIsland(1);
    ok(editingMask(e.doc,false) === mask, "Global island selection does not replace a layer binding");
    e.doc.restrict = false;
    e.tool = "brush";e.color = "#00ff00";e.brushSize = 8;
    new PaintStroke(e,{x:48,y:32}).finish();
    new PaintStroke(e,{x:16,y:32}).finish();
    ok(pixel(e.layer.canvas,48)[0] === 255 && pixel(e.layer.canvas,16)[1] === 255,
      "Painting follows the bound island even with global clipping off");
    e.beginTransform();
    ok(e.transform.clip === mask, "Transforms keep the layer's bound UV mask");
    e.updateTransform(e.transform.points.map(p=>({x:p.x+8,y:p.y})));
    e.confirmTransform();
    ok(e.layer.uvBinding.island.id === 0 && pixel(e.output,48)[3] === 0 && pixel(e.layer.canvas,48)[3] === 255,
      "Applying transforms preserves the binding and hidden source pixels");
    e.setLayerIsland(1);
    ok(pixel(e.output,48)[3] === 255 && pixel(e.output,16)[3] === 0, "Rebinding reveals previously hidden pixels");
    e.undo();ok(e.layer.uvBinding.island.id === 0, "Undo restores the previous island binding");
    e.redo();ok(e.layer.uvBinding.island.id === 1, "Redo restores the new island binding");
    e.duplicateLayer();
    ok(e.layer.uvBinding.island.id === 1, "Duplicate retains the island binding");
    const second = e.layer.id;
    e.setLayerIsland(0);e.selectLayer(first);
    ok(e.layer.uvBinding.island.id === 1, "Different layers keep independent bindings");
    e.doc.uvSet = "uv1";
    e.doc.selectedIslands = [0];
    ok(editingMask(e.doc,false) === e.layer.uvMask && e.layer.uvBinding.uvSet === "uv",
      "Changing displayed UV map does not reinterpret an existing binding");
    e.setLayerIsland(null);
    ok(!e.layer.uvBinding && pixel(e.output,16)[3] === 255 && pixel(e.output,48)[3] === 255,
      "Unlinking restores the unmasked source when global clipping is off");
    e.undo();
    e.selectLayer(second);e.mergeDown();
    ok(!e.layer.uvBinding && !e.layer.uvMask, "Merge down flattens both visible masks without keeping a stale binding");
    e.undo();ok(e.layer.uvBinding.island.id === 0, "Undo merge restores the per-layer binding");
    await e.newCanvas(128,128);
    ok(e.layer.uvMask.width === 128 && e.layer.uvBinding.island.id === 0, "Resize preserves and scales the bound mask");
    await e.importImage(new Uint8Array(await (await toPNG(e.layer.canvas)).arrayBuffer()), "linked-image.png");
    ok(e.layer.uvBinding.island.id === 0 && e.transform.clip === e.layer.uvMask,
      "Imported images inherit the active layer binding, including their placement mask");
    e.confirmTransform();
    return checks;
  });
  results.forEach(label=>console.log("PASS",label));
  await page.evaluate(async()=>{const {editor:e}=await import('/src/core/editor.ts');await e.sample();e.setTool('brush');});
  const dropdown = page.getByLabel("Layer UV island",{exact:true});
  check(await page.locator(".uv-panel,.island-list").count() === 0, "UV Guides panel is removed");
  check(await dropdown.locator('option').count() === 7, "Layer dropdown contains every UV island and unlink option");
  await dropdown.selectOption('uv:1');
  const state = () => page.evaluate(async()=>{const {editor:e}=await import('/src/core/editor.ts');return {binding:e.layer.uvBinding?.island.id,picking:e.pickingLayerIsland,pixels:e.layer.canvas.toDataURL(),history:e.history.undoStack.length,mode:e.uvDisplay};});
  check((await state()).binding === 1, "Dropdown binds the active layer");
  await page.getByTitle('New empty layer',{exact:true}).click();
  check(await dropdown.inputValue() === '', "New empty layers start without a linked island");
  await dropdown.selectOption('uv:2');
  await page.locator('.layer-row').last().click();
  check(await dropdown.inputValue() === 'uv:1', "Selecting another layer restores its own dropdown value");
  const before = await state();
  const picker = () => page.getByTitle('Pick UV island from canvas or model',{exact:true});
  await picker().click();
  await page.getByTestId('texture-canvas').click({position:{x:5,y:5}});
  check((await state()).picking && (await state()).binding === 1, "Picking blank space leaves the binding intact and picker armed");
  await page.keyboard.press('Escape');check(!(await state()).picking, "Escape cancels picking");
  await picker().click();
  await page.getByTestId('texture-canvas').click();
  check((await state()).binding === 0 && !(await state()).picking && (await state()).pixels === before.pixels,
    "2D picker binds an island without painting or transforming pixels");
  await picker().click();
  await page.getByTestId('preview-canvas').hover();await page.keyboard.press('Numpad1');
  await page.getByTestId('preview-canvas').click();
  check((await state()).binding === 4 && (await state()).pixels === before.pixels,
    "3D picker distinguishes overlapping UV islands by their original model faces");
  await page.keyboard.press('Control+z');check((await state()).binding === 0, "Picker binding can be undone from the keyboard");
  const layers = await page.evaluate(async()=>{
    const {editor:e}=await import('/src/core/editor.ts');
    const first=e.layer.id;e.setLayerIsland(4);e.addEmpty();e.setLayerIsland(5);const back=e.layer.id;
    e.addEmpty();e.setLayerIsland(4);const top=e.layer.id;e.selectLayer(back);
    return {first,back,top};
  });
  const active=()=>page.evaluate(async()=>{const {editor:e}=await import('/src/core/editor.ts');return {id:e.layer.id,selected:e.doc.selectedIslands,history:e.history.undoStack.length,pixels:e.output.toDataURL()};});
  const historyBeforeClick=(await active()).history;
  await page.getByTestId('preview-canvas').click();
  check((await active()).id===layers.top&&(await active()).selected[0]===4,'Ordinary 3D click selects the corresponding island and top linked visible layer');
  check((await active()).history===historyBeforeClick,'3D layer selection does not create pixel undo entries');
  await page.evaluate(async id=>{const {editor:e}=await import('/src/core/editor.ts');e.selectLayer(id);},layers.first);
  await page.getByTestId('preview-canvas').click();
  check((await active()).id===layers.first,'3D click retains the active layer when it is already bound to the clicked island');
  await page.getByTestId('preview-canvas').hover();await page.keyboard.press('Control+Numpad1');
  await page.getByTestId('preview-canvas').click();
  check((await active()).id===layers.back&&(await active()).selected[0]===5,'Clicking another face with overlapping UVs selects its own linked layer');
  await page.getByTestId('preview-canvas').click({position:{x:3,y:3}});
  check((await active()).id===layers.back,'Clicking empty 3D space preserves the current layer');
  const material=await page.evaluate(async()=>{
    const {editor:e}=await import('/src/core/editor.ts');const original=e.activeId;
    e.selectMaterial(e.model.slots[1].id);e.setLayerIsland(2);
    const result={material:e.activeId,layer:e.layer.id};e.selectMaterial(original);return result;
  });
  await page.getByTestId('preview-canvas').hover();await page.keyboard.press('Numpad7');
  await page.getByTestId('preview-canvas').click();
  check(await page.evaluate(async expected=>{const {editor:e}=await import('/src/core/editor.ts');return e.activeId===expected.material&&e.layer.id===expected.layer&&e.doc.selectedIslands[0]===2;},material),
    '3D click selects the material, island and linked layer of another model part');
  await page.getByTitle('Application menu',{exact:true}).click();
  await page.getByRole('menuitem',{name:'Settings',exact:true}).click();
  check(await page.getByLabel('Clip edits to UV islands',{exact:true}).count() === 1 && await page.getByLabel('UV map name',{exact:true}).count() === 1,
    "UV clipping and map alias remain accessible in Settings");
  await page.keyboard.press('Escape');
  check(await page.getByLabel('UV set',{exact:true}).count() === 1, "UV map selector remains available beside the material");
  await mkdir('test-results',{recursive:true});
  await page.screenshot({path:'test-results/layer-islands.png'});
  assert.deepEqual(errors,[]);
} finally { await app.close();await server.close(); }
