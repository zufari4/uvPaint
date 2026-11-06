import { _electron as electron } from 'playwright';
import { createServer } from 'vite';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const server = await createServer(); await server.listen();
const env = { ...process.env, UVPAINT_DEV_URL: 'http://127.0.0.1:5173' }; delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.', `--user-data-dir=${process.cwd()}/test-results/selection-profile`], env });
const check = (v, label) => { assert.ok(v, label); console.log('PASS', label); };
try {
  const page = await app.firstWindow(), errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.waitForSelector('.empty-canvas');
  await page.evaluate(async () => {
    const { editor: e } = await import('/src/core/editor.ts'); window.e = e;
    const { context } = await import('/src/core/canvas.ts');
    await e.newCanvas(256, 256); context(e.layer.canvas).fillStyle = '#ef8542'; context(e.layer.canvas).fillRect(0, 0, 256, 256);
    e.setTool('rect'); e.emit(true); window.originalPixels = e.layer.canvas.toDataURL();
  });
  await page.getByTitle('Fit canvas', { exact: true }).click();
  const coords = async (x, y) => {
    const b = await page.getByTestId('texture-canvas').boundingBox(), s = Math.min((b.width - 100) / 256, (b.height - 100) / 256);
    return { x: b.x + (b.width - 256 * s) / 2 + x * s, y: b.y + (b.height - 256 * s) / 2 + y * s };
  };
  const drag = async (from, to, finish = true) => {
    const a = await coords(...from), b = await coords(...to);
    await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 7 }); if (finish) await page.mouse.up();
  };
  const state = () => page.evaluate(async () => {
    const { alphaBounds } = await import('/src/core/canvas.ts');
    return { bounds: e.doc.selection && alphaBounds(e.doc.selection), mask: e.doc.selection?.toDataURL(), history: e.history.undoStack.length, pixels: e.layer.canvas.toDataURL() === window.originalPixels };
  });
  await drag([32, 32], [96, 80]);
  const original = await state(); check(original.bounds.width === 64 && original.bounds.height === 48, `Rectangle creates a selection with editable bounds: ${JSON.stringify(original.bounds)}`);
  await drag([96, 80], [112, 96]);
  const resized = await state(); check(resized.bounds.width === 80 && resized.bounds.height === 64 && resized.pixels && resized.history === original.history + 1, 'Corner handle resizes only the area and records one undo step');
  await page.keyboard.press('Control+z'); check((await state()).mask === original.mask, 'Undo restores the selection before resizing');
  await page.keyboard.press('Control+Shift+z'); check((await state()).mask === resized.mask, 'Redo restores the resized selection');
  await drag([112, 64], [128, 64]); check((await state()).bounds.width === 96 && (await state()).bounds.height === 64, 'Side handle stretches only its own axis');
  const beforeMove = await state(); await drag([80, 64], [96, 72]);
  const moved = await state(); check(moved.bounds.x === 48 && moved.bounds.y === 40 && moved.bounds.width === 96 && moved.pixels, 'Center handle moves the selection while leaving image pixels unchanged');
  await page.keyboard.press('Control+z'); check((await state()).mask === beforeMove.mask, 'Selection movement is undoable');
  await drag([128, 96], [144, 120], false); await page.keyboard.press('Escape'); await page.mouse.up();
  check((await state()).mask === beforeMove.mask, 'Escape cancels an in-progress selection resize');
  for (const tool of ['lasso', 'polygon', 'wand']) {
    await page.evaluate(async tool => {
      const { polygonMask } = await import('/src/tools/selection.ts');
      e.setTool(tool); e.setSelection(polygonMask(256, 256, [{ x: 32, y: 32 }, { x: 96, y: 32 }, { x: 32, y: 96 }]));
    }, tool);
    await drag([96, 96], [128, 128]);
    check(await page.evaluate(() => {
      const ctx = e.doc.selection.getContext('2d');
      return ctx.getImageData(40, 40, 1, 1).data[3] === 255 && ctx.getImageData(116, 116, 1, 1).data[3] === 0 && e.layer.canvas.toDataURL() === window.originalPixels;
    }), `${tool} handles resize the original irregular mask without filling its transparent corners`);
  }
  await mkdir('test-results', { recursive: true }); await page.screenshot({ path: 'test-results/selection-handles.png' });
  await page.evaluate(()=>{window.areaSelection=e.doc.selection;e.setTool('move');window.areaTransform=e.transform;window.areaHistory=e.history.undoStack.length;});
  const insideArea=await coords(64,64);await page.mouse.click(insideArea.x,insideArea.y);
  check(await page.evaluate(()=>e.doc.selection===window.areaSelection&&e.transform===window.areaTransform&&e.history.undoStack.length===window.areaHistory),'Clicking an image in Transform preserves an existing area selection and frame');
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    e.deselect(); e.doc.islands = [0, 1].map(id => ({ id, triangles: [
      [{ x: id * .5, y: 0 }, { x: (id + 1) * .5, y: 0 }, { x: id * .5, y: .5 }],
      [{ x: (id + 1) * .5, y: 0 }, { x: (id + 1) * .5, y: .5 }, { x: id * .5, y: .5 }],
    ] }));
    e.setLayerIsland(0); window.leftLayer = e.layer.id; e.addEmpty(); e.setLayerIsland(1); window.rightLayer = e.layer.id; e.setTool('move');
    window.pixelHistory = e.history.undoStack.length;
  });
  await page.getByTitle('Fit canvas', { exact: true }).click();
  const click = async (x, y, shift = false) => { const p = await coords(x, y); if (shift) await page.keyboard.down('Shift'); await page.mouse.click(p.x, p.y); if (shift) await page.keyboard.up('Shift'); };
  await click(64, 64);
  check(await page.evaluate(() => e.layer.id === window.leftLayer && e.doc.selectedIslands[0] === 0 && !!e.transform && e.history.undoStack.length === window.pixelHistory), 'Move-tool click selects the island and linked layer and opens its transform frame');
  await click(220,220);
  check(await page.evaluate(()=>!e.transform&&!e.doc.selectedIslands.length),'Clicking blank space inside a transform frame clears island selection and closes the frame');
  await click(64,64);
  await click(192, 64, true);
  check(await page.evaluate(() => e.layer.id === window.rightLayer && e.doc.selectedIslands.length === 2), 'Shift-click keeps multiple islands selected while choosing the linked layer');
  for(const kind of ['free','perspective','mesh']) {
    await page.evaluate(async kind=>{
      e.selectLayer(window.leftLayer);
      const {polygonMask}=await import('/src/tools/selection.ts');
      e.setSelection(polygonMask(256,256,[{x:32,y:32},{x:96,y:32},{x:96,y:96},{x:32,y:96}]));
      e.beginTransform(kind);window.beforeOutsideClick=e.history.undoStack.length;
    },kind);
    await click(192,64);
    check(await page.evaluate(()=>!e.transform&&!e.doc.selectedIslands.length&&!e.doc.selection&&e.layer.id===window.leftLayer&&e.history.undoStack.length===window.beforeOutsideClick),`${kind}: click outside the frame clears selection even over another island and opaque pixels`);
    await click(192,64);
    check(await page.evaluate(()=>e.layer.id===window.rightLayer&&e.doc.selectedIslands[0]===1),`${kind}: next click selects that island's linked layer`);
  }
  await page.evaluate(() => { e.selectLayer(window.leftLayer); e.doc.selectedIslands = []; });
  await drag([64, 64], [74, 64]);
  check(await page.evaluate(() => !!e.transform && Math.abs(e.transform.points[0].x - 10) < .1), 'Dragging with Move still translates the image after the click threshold');
  await page.keyboard.press('Escape');
  const visibilityChecks = await page.evaluate(async () => {
    const { TextureVisibility } = await import('/src/render/texture-visibility.ts');
    const { canvas, context } = await import('/src/core/canvas.ts');
    const logs = [], ok = (v, label) => { if (!v) throw new Error(label); logs.push(label); };
    const image = canvas(256, 256); context(image).fillStyle = '#ee2244'; context(image).fillRect(0, 0, 256, 256);
    const islands = e.doc.islands.map(i => ({ ...i, faces: i.triangles.map((tri, n) => ({ meshId: 'fixture', triangle: i.id * 2 + n, vertices: tri.map(p => `fixture:${p.x},${p.y}`), normal: [0, 0, 1] })) }));
    const doc = { ...e.doc, islands }, hidden = new Set(['fixture:0', 'fixture:1']), visibility = new TextureVisibility();
    visibility.update(doc, hidden, [islands[1]]);
    const out = visibility.render(image), pixel = (c, x, y) => [...context(c).getImageData(x, y, 1, 1).data];
    ok(pixel(out, 64, 64)[3] === 0 && pixel(out, 192, 64)[3] === 255 && pixel(image, 64, 64)[3] === 255, 'Hidden UV island pixels disappear from the 2D view without altering source pixels');
    const buffer = out, rebuilds = visibility.rebuilds;
    for (let i = 0; i < 10; i++) { visibility.update(doc, hidden, [islands[1]]); visibility.render(image); }
    ok(visibility.render(image) === buffer && visibility.rebuilds === rebuilds, '2D hiding reuses its mask and display buffer during repaint');
    const overlap = { ...islands[1], triangles: islands[0].triangles };
    visibility.update({ ...doc, islands: [islands[0], overlap] }, hidden, [overlap]);
    ok(pixel(visibility.render(image), 64, 64)[3] === 255, 'Overlapping visible surfaces retain their shared UV pixels');
    visibility.update(doc, new Set(), islands);
    ok(visibility.render(image) === null, 'Show all removes the view-only mask');
    e.doc.islands = islands; e.selectLayer(window.leftLayer); e.selectIsland(0); e.setIslandVisibility('except');
    window.beforeHidePixels = e.layer.canvas.toDataURL(); e.emit(true);
    return logs;
  });
  visibilityChecks.forEach(label => console.log('PASS', label));
  await page.getByTitle('Fit canvas', { exact: true }).click();
  const hiddenPixel = await coords(64, 64);
  const displayedPixel = () => page.getByTestId('texture-canvas').evaluate((c, p) => {
    const r = c.getBoundingClientRect(); return [...c.getContext('2d').getImageData((p.x-r.left)*c.width/r.width,(p.y-r.top)*c.height/r.height,1,1).data];
  }, hiddenPixel);
  check((await displayedPixel())[0] < 100, 'Texture canvas displays checkerboard inside a hidden island');
  await page.evaluate(() => { e.setIslandVisibility('all'); });
  await page.waitForFunction(() => !e.hiddenFaces.size);
  check((await displayedPixel())[0] > 200 && await page.evaluate(() => e.layer.canvas.toDataURL() === window.beforeHidePixels), 'Show all restores the displayed image with identical layer pixels');
  await page.evaluate(async () => {
    await e.newCanvas(512, 128);
    e.doc.restrict=false;e.setLayerIsland(null);
    const ctx = e.layer.canvas.getContext('2d'); ctx.fillStyle = '#00ff00'; ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = '#0000ff'; ctx.fillRect(128, 0, 256, 128); e.emit(true);
  });
  // Thumbnails of in-place edits redraw shortly after the edit pauses.
  await page.waitForTimeout(400);
  check(await page.locator('.layer-row.selected .layer-thumb').evaluate(c => {
    const ctx = c.getContext('2d'), pixel=(x,y)=>ctx.getImageData(x,y,1,1).data;
    return pixel(0,18)[1]===255 && pixel(43,18)[1]===255 && pixel(22,18)[2]===255 && pixel(22,5)[3]===0 && pixel(22,30)[3]===0;
  }), 'Wide layer thumbnail preserves proportions and both edges with transparent space above and below');
  await page.evaluate(() => {
    const ctx=e.layer.canvas.getContext('2d');ctx.clearRect(0,0,512,128);
    ctx.fillStyle='#ff0000';ctx.fillRect(10,10,44,36);
    ctx.fillStyle='#00ff00';ctx.fillRect(70,10,44,36);
    e.doc.islands=[10,70].map((x,id)=>({id,triangles:[
      [{x:x/512,y:10/128},{x:(x+44)/512,y:10/128},{x:(x+44)/512,y:46/128}],
      [{x:x/512,y:10/128},{x:(x+44)/512,y:46/128},{x:x/512,y:46/128}]
    ]}));e.setLayerIsland(0);e.emit(true);window.thumbnailSource=e.layer.canvas.toDataURL();
  });
  const thumbColor = async channel => { await page.waitForTimeout(400); return page.locator('.layer-row.selected .layer-thumb').evaluate((c,channel) => {
    const ctx=c.getContext('2d');return [[1,1],[42,1],[1,34],[42,34],[22,18]].every(([x,y])=>{
      const p=ctx.getImageData(x,y,1,1).data;return p[channel]===255&&p[3]===255;
    });
  },channel); };
  check(await thumbColor(0),'Small off-center bound island fills the entire layer thumbnail');
  await page.evaluate(()=>e.setLayerIsland(1));
  check(await thumbColor(1),'Rebinding refreshes the thumbnail without changing source pixels');
  await page.evaluate(()=>e.undo());
  check(await thumbColor(0)&&await page.evaluate(()=>e.layer.canvas.toDataURL()===window.thumbnailSource),'Undo restores thumbnail framing and preserves the full layer source');
  await page.evaluate(async () => {
    const { Editor } = await import('/src/core/editor.ts'); const saved = localStorage.getItem('uvpaint.preferences'); localStorage.removeItem('uvpaint.preferences');
    const fresh = new Editor(); window.defaults = [fresh.uvDisplay, fresh.previewEdges, fresh.textScale];
    localStorage.setItem('uvpaint.preferences', JSON.stringify({ uvDisplay: 'triangles', textScale: 1.8 }));
    window.custom = new Editor().uvDisplay;
    if (saved === null) localStorage.removeItem('uvpaint.preferences'); else localStorage.setItem('uvpaint.preferences', saved);
  });
  check(JSON.stringify(await page.evaluate(() => window.defaults)) === JSON.stringify(['outline', true, 1.4]), 'Fresh settings use UV outlines, enabled 3D edges and 140% text');
  check(await page.evaluate(() => window.custom) === 'triangles', 'Existing UV display preferences are preserved');
  await mkdir('test-results', { recursive: true }); await page.screenshot({ path: 'test-results/selection-workspace.png' });
  assert.deepEqual(errors, []);
} finally { await app.close(); await server.close(); }
