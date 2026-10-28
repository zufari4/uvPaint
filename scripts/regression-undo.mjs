import { _electron as electron } from 'playwright';
import { createServer } from 'vite';
import assert from 'node:assert/strict';
const server=await createServer();await server.listen();
const env={...process.env,UVPAINT_DEV_URL:'http://127.0.0.1:5173'};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({args:['.',`--user-data-dir=${process.cwd()}/test-results/undo-profile`],env});
try {
  assert.equal(await app.evaluate(({Menu})=>Menu.getApplicationMenu()===null),true);
  console.log('PASS Native Edit menu cannot intercept document Undo/Redo');
  const page=await app.firstWindow();await page.waitForSelector('.empty-canvas');
  for(const bound of [false,true]) {
    await page.evaluate(async(bound)=>{
      const {editor:e}=await import('/src/core/editor.ts');
      const {context}=await import('/src/core/canvas.ts');
      const {polygonMask}=await import('/src/tools/selection.ts');
      await e.newCanvas(64,64);e.addEmpty();
      context(e.layer.canvas).fillStyle='#ff0000';context(e.layer.canvas).fillRect(0,0,64,64);
      e.doc.islands=[{id:0,triangles:[[{x:0,y:0},{x:1,y:0},{x:1,y:1}],[{x:0,y:0},{x:1,y:1},{x:0,y:1}]]}];
      if(bound) {e.setLayerIsland(0);e.beginTransform();e.updateTransform(e.transform.points.map(p=>({x:p.x+1,y:p.y})));e.confirmTransform();}
      e.setSelection(polygonMask(64,64,[{x:8,y:8},{x:24,y:8},{x:24,y:24},{x:8,y:24}]));
      e.setTool('rect');window.undoBefore=e.history.undoStack.length;e.emit(true);
    },bound);
    const state=()=>page.evaluate(async()=>{const {editor:e}=await import('/src/core/editor.ts');return {alpha:e.layer.canvas.getContext('2d').getImageData(12,12,1,1).data[3],outside:e.layer.canvas.getContext('2d').getImageData(36,12,1,1).data[3],history:e.history.undoStack.length,expected:window.undoBefore+1};});
    await page.getByTestId('texture-canvas').focus();
    await page.keyboard.press('Delete');await page.keyboard.press('Delete');
    await page.keyboard.down('Delete');await page.keyboard.down('Delete');await page.keyboard.up('Delete');
    let s=await state();assert.equal(s.alpha,0);assert.equal(s.outside,255);assert.equal(s.history,s.expected);
    await page.getByLabel('Layer blend mode',{exact:true}).focus();
    await page.keyboard.press('Control+z');assert.equal((await state()).alpha,255);
    await page.keyboard.press('Control+Shift+z');assert.equal((await state()).alpha,0);
    await page.keyboard.press('Control+z');assert.equal((await state()).alpha,255);
    console.log(`PASS Delete, repeated Delete, Undo/Redo after dropdown focus: ${bound?'UV-bound transformed':'ordinary'} layer`);
  }
} finally {await app.close();await server.close();}
