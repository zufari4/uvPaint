import { _electron as electron } from "playwright";
import { createServer } from "vite";
import { mkdir, readFile } from "node:fs/promises";
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
    const lowerBeforeMerge = { ...e.layer };
    e.selectLayer(second);const upperBeforeMerge = { ...e.layer };e.mergeDown();
    ok(e.layer.id === first && e.layer.name === lowerBeforeMerge.name && e.layer.name !== upperBeforeMerge.name,
      "Merge down retains the lower layer's identity and name");
    ok(e.layer.uvBinding === lowerBeforeMerge.uvBinding && e.layer.uvMask === lowerBeforeMerge.uvMask && e.layer.uvBinding.island.id === 1,
      "Merge down retains the lower layer's UV set, island binding and mask");
    ok(pixel(e.output,16)[3] === 0 && pixel(e.output,48)[3] === 255 && pixel(e.layer.canvas,16)[3] === 255,
      "Merged output follows the lower island while source pixels outside it remain available");
    e.undo();ok(e.layer.id === second && e.layer.uvBinding.island.id === 0 && e.layer.name === upperBeforeMerge.name && e.doc.layers[0].canvas === lowerBeforeMerge.canvas,
      "Undo merge restores both original layers, names, pixels and bindings");
    e.redo();ok(e.layer.name === lowerBeforeMerge.name && e.layer.uvBinding === lowerBeforeMerge.uvBinding,
      "Redo merge retains the lower layer's name and binding");
    e.undo();
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
  check(await page.evaluate(async()=>{
    const {editor:e}=await import('/src/core/editor.ts');const {composite}=await import('/src/render/composite.ts');
    const slot=e.model.slots[1],doc=[...e.docs.values()].find(d=>d.id===slot.id);
    const read=c=>[...c.getContext('2d').getImageData(0,0,doc.width,doc.height).data];
    const shown=read(slot.texture.image),expected=read(composite(doc));
    return slot.id!==e.activeId&&doc.layers.length>1&&shown.every((v,i)=>Math.abs(v-expected[i])<=1);
  }),'Sample: the inactive material shows all of its layers in 3D without switching to it');
  check(await page.locator(".uv-panel,.island-list").count() === 0, "UV Guides panel is removed");
  check(await page.locator('.layer-island-binding').count()===0 && await page.getByLabel('Layer UV island',{exact:true}).count()===0,'UV binding dropdown row is removed');
  check(await page.locator('.layer-footer').getByTitle('Pick UV island from canvas or model',{exact:true}).locator('svg.lucide-square-mouse-pointer').count()===1,'UV picking uses a region-and-cursor icon in the layer footer');
  await page.evaluate(async()=>{const {editor:e}=await import('/src/core/editor.ts');e.setLayerIsland(1);});
  const state = () => page.evaluate(async()=>{const {editor:e}=await import('/src/core/editor.ts');return {binding:e.layer.uvBinding?.island.id,picking:e.pickingLayerIsland,pixels:e.layer.canvas.toDataURL(),history:e.history.undoStack.length,mode:e.uvDisplay};});
  check((await state()).binding === 1, "Binding is retained without the dropdown");
  await page.getByTitle('New empty layer',{exact:true}).click();
  check((await state()).binding===undefined, "New empty layers start without a linked island");
  await page.evaluate(async()=>{const {editor:e}=await import('/src/core/editor.ts');e.setLayerIsland(2);});
  await page.locator('.layer-row').last().click();
  check((await state()).binding === 1, "Selecting another layer restores its own UV binding");
  check(await page.evaluate(async()=>{const {editor:e}=await import('/src/core/editor.ts');const {sourceGeometry}=await import('/src/render/mesh-source.ts');
    const full=p=>sourceGeometry(p).index.count,faces=e.model.parts.reduce((s,p)=>s+full(p)/3,0);
    return e.visibleIslands.length===1&&e.visibleIslands[0].id===1&&e.textureHiddenFaces.size===faces-2&&e.hiddenFaces.size===0&&e.model.parts.every(p=>p.geometry.index.count===full(p));}),
    'Selecting a bound layer isolates 2D pixels and guides while all 3D faces remain visible');
  const isolation = await page.evaluate(async()=>{
    const {Editor}=await import('/src/core/editor.ts'); const e=new Editor(); await e.sample();
    e.setLayerIsland(0); const first=e.layer.id; e.addEmpty();const unbound=e.layer.id;e.addEmpty();e.setLayerIsland(1);const second=e.layer.id;
    const history=e.history.undoStack.length,pixels=e.output.toDataURL();
    e.selectLayer(first);const firstHidden=[...e.textureHiddenFaces];
    e.selectLayer(second);const switches=e.visibleIslands.length===1&&e.visibleIslands[0].id===1;
    e.doc.uvSet='uv1';e.selectLayer(first);const otherUV=JSON.stringify([...e.textureHiddenFaces])===JSON.stringify(firstHidden);
    e.selectLayer(unbound);const all=e.textureHiddenFaces.size===0;
    e.selectIsland(3);e.setIslandVisibility('except');const manual=e.hiddenFaces;
    e.selectLayer(first);e.selectLayer(unbound);
    return {switches,otherUV,all,unchanged:e.output.toDataURL()===pixels&&e.history.undoStack.length===history,manual:e.hiddenFaces===manual&&manual.size===2};
  });
  check(isolation.switches&&isolation.otherUV,'Changing bound layers reveals their own faces, including bindings on another UV map');
  check(isolation.all&&isolation.unchanged,'Unbound layer restores all islands; layer selection preserves pixels and undo history');
  check(isolation.manual,'Selecting layers preserves explicit 3D hiding');
  const showAll=()=>page.evaluate(async()=>{const {editor:e}=await import('/src/core/editor.ts');e.setIslandVisibility('all');});
  await showAll();
  const before = await state();
  const picker = () => page.getByTitle('Pick UV island from canvas or model',{exact:true});
  await picker().click();
  await page.getByTestId('texture-canvas').click({position:{x:5,y:5}});
  check((await state()).picking && (await state()).binding === 1, "Picking blank space leaves the binding intact and picker armed");
  await page.keyboard.press('Escape');check(!(await state()).picking, "Escape cancels picking");
  await picker().click();
  await page.getByTestId('texture-canvas').click();
  const centre=await page.evaluate(async()=>{const {editor:e}=await import('/src/core/editor.ts');const {hitIsland}=await import('/src/tools/uv.ts');return hitIsland(e.doc,{x:e.doc.width/2,y:e.doc.height/2});});
  check((await state()).binding === centre && !(await state()).picking && (await state()).pixels === before.pixels,
    "2D picker binds an island without painting or transforming pixels");
  // Moves over the 3D view until the given material island is under the pointer.
  const aim=async(slot,island)=>{
    const view=page.getByTestId('preview-canvas'),box=await view.boundingBox();
    const target=await page.evaluate(async([slot,island])=>{const {editor:e}=await import('/src/core/editor.ts');return `${e.model.slots[slot].id}:${island}`;},[slot,island]);
    for(let fy=0.3;fy<=0.75;fy+=0.05) for(let fx=0.05;fx<=0.95;fx+=0.03){
      await page.mouse.move(box.x+box.width*fx,box.y+box.height*fy);
      if(await view.getAttribute('data-hover-island')===target) return {x:box.width*fx,y:box.height*fy};
    }
    throw new Error(`Island ${target} is not visible in the 3D view`);
  };
  await picker().click();
  await page.getByTestId('preview-canvas').hover();await page.keyboard.press('Numpad1');
  const front=await aim(0,4);
  await page.getByTestId('preview-canvas').click({position:front});
  check((await state()).binding === 4 && (await state()).pixels === before.pixels,
    "3D picker distinguishes overlapping UV islands by their original model faces");
  await page.keyboard.press('Control+z');check((await state()).binding === centre, "Picker binding can be undone from the keyboard");
  const layers = await page.evaluate(async()=>{
    const {editor:e}=await import('/src/core/editor.ts');
    const first=e.layer.id;e.setLayerIsland(4);
    // Test layers go above the sample's own linked stencils.
    e.selectLayer(e.doc.layers.at(-1).id);e.addEmpty();e.setLayerIsland(5);const back=e.layer.id;
    e.selectLayer(e.doc.layers.at(-1).id);e.addEmpty();e.setLayerIsland(4);const top=e.layer.id;e.selectLayer(back);
    return {first,back,top};
  });
  const active=()=>page.evaluate(async()=>{const {editor:e}=await import('/src/core/editor.ts');return {id:e.layer.id,selected:e.doc.selectedIslands,history:e.history.undoStack.length,pixels:e.output.toDataURL()};});
  const historyBeforeClick=(await active()).history;
  await showAll();
  await page.getByTestId('preview-canvas').click({position:front});
  check((await active()).id===layers.top&&(await active()).selected[0]===4,'Ordinary 3D click selects the corresponding island and top linked visible layer');
  check((await active()).history===historyBeforeClick,'3D layer selection does not create pixel undo entries');
  await page.evaluate(async id=>{const {editor:e}=await import('/src/core/editor.ts');e.selectLayer(id);},layers.first);
  await page.getByTestId('preview-canvas').click({position:front});
  check((await active()).id===layers.first,'3D click retains the active layer when it is already bound to the clicked island');
  await showAll();
  await page.getByTestId('preview-canvas').hover();await page.keyboard.press('Control+Numpad1');
  await page.getByTestId('preview-canvas').click({position:await aim(0,5)});
  check((await active()).id===layers.back&&(await active()).selected[0]===5,'Clicking another face with overlapping UVs selects its own linked layer');
  await page.getByTestId('preview-canvas').click({position:{x:3,y:3}});
  check((await active()).id===layers.back,'Clicking empty 3D space preserves the current layer');
  const material=await page.evaluate(async()=>{
    const {editor:e}=await import('/src/core/editor.ts');const {hitIsland}=await import('/src/tools/uv.ts');const original=e.activeId;
    e.selectMaterial(e.model.slots[1].id);
    // The drum lid is painted on the first cap disc of the drum texture.
    const lid=hitIsland(e.doc,{x:.25*e.doc.width,y:.74*e.doc.height});e.setLayerIsland(lid);
    const result={material:e.activeId,layer:e.layer.id,lid};e.selectMaterial(original);return result;
  });
  await showAll();
  await page.getByTestId('preview-canvas').hover();await page.keyboard.press('Numpad7');
  await page.getByTestId('preview-canvas').click({position:await aim(1,material.lid)});
  check(await page.evaluate(async expected=>{const {editor:e}=await import('/src/core/editor.ts');return e.activeId===expected.material&&e.layer.id===expected.layer&&e.doc.selectedIslands[0]===expected.lid;},material),
    '3D click selects the material, island and linked layer of another model part');
  await page.getByTitle('Application menu',{exact:true}).click();
  await page.getByRole('menuitem',{name:'Settings',exact:true}).click();
  check(await page.getByLabel('Clip edits to UV islands',{exact:true}).count() === 0 && await page.getByLabel('UV map name',{exact:true}).count() === 0,
    "Unused UV clipping and map alias options are hidden from Settings");
  await page.keyboard.press('Escape');
  check(await page.getByLabel('UV set',{exact:true}).count() === 1, "UV map selector remains available beside the material");
  await mkdir('test-results',{recursive:true});
  await page.screenshot({path:'test-results/layer-islands.png'});
  if (process.env.UVPAINT_TEST_MODEL) {
    const encoded=(await readFile(process.env.UVPAINT_TEST_MODEL)).toString('base64');
    const actual=await page.evaluate(async encoded=>{
      const {editor:e}=await import('/src/core/editor.ts');
      const {sourceGeometry}=await import('/src/render/mesh-source.ts');
      const {TextureVisibility}=await import('/src/render/texture-visibility.ts');
      const {islandMask}=await import('/src/tools/uv.ts');
      await e.importModel(Uint8Array.from(atob(encoded),c=>c.charCodeAt(0)),'Visibility regression.glb');
      e.addEmpty();e.setLayerIsland(e.doc.islands[Math.min(15,e.doc.islands.length-1)].id);e.selectLayer(e.layer.id);
      const hidden=e.textureHiddenFaces,visible=e.visibleIslands,pixels=e.output.toDataURL(),history=e.history.undoStack.length;
      const view=new TextureVisibility();view.update(e.doc,hidden,visible,e.textureIsolated);const rebuilds=view.rebuilds;
      for(let i=0;i<100;i++)view.update(e.doc,e.textureHiddenFaces,e.visibleIslands,e.textureIsolated);
      const rendered=view.render(e.output),mask=islandMask({...e.doc,islands:visible,selectedIslands:[]});
      const alpha=rendered.getContext('2d').getImageData(0,0,e.doc.width,e.doc.height).data,allowed=mask.getContext('2d').getImageData(0,0,e.doc.width,e.doc.height).data;
      let fringes=0;for(let i=3;i<alpha.length;i+=4)if(alpha[i]&&!allowed[i])fringes++;
      return {single:visible.length===1,fringes,cached:view.rebuilds===rebuilds&&e.textureHiddenFaces===hidden&&e.visibleIslands===visible,
        preserved:e.output.toDataURL()===pixels&&e.history.undoStack.length===history,expected:e.model.parts.map(p=>sourceGeometry(p).index?.count??sourceGeometry(p).getAttribute('position').count)};
    },encoded);
    await page.waitForTimeout(100);
    check(actual.single&&actual.cached&&actual.preserved,'Real GLB: only bound island guides remain; visibility masks are cached and export pixels unchanged');
    check(actual.fringes===0,'Real GLB: no texture fringes remain outside the isolated island');
    check(await page.evaluate(async expected=>{const {editor:e}=await import('/src/core/editor.ts');return !e.hiddenFaces.size&&e.model.parts.every((p,i)=>p.geometry.index.count===expected[i]);},actual.expected),'Real GLB: automatic layer focus retains every triangle in 3D');
    await page.screenshot({path:'test-results/real-model-layer-focus.png'});
  }
  assert.deepEqual(errors,[]);
} finally { await app.close();await server.close(); }
