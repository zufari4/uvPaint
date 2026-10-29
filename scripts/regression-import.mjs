import { _electron as electron } from 'playwright';
import { createServer } from 'vite';
import { mkdir,writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const server=await createServer();await server.listen();
const env={...process.env,UVPAINT_DEV_URL:'http://127.0.0.1:5173'};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({args:['.',`--user-data-dir=${process.cwd()}/test-results/import-profile`],env});
const check=(v,label)=>{assert.ok(v,label);console.log('PASS',label);};
try {
  const page=await app.firstWindow(), errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.waitForSelector('.empty-canvas');await mkdir('test-results',{recursive:true});
  const fixture=await page.evaluate(async()=>{
    const {editor:e}=await import('/src/core/editor.ts');const {canvas,context,toPNG}=await import('/src/core/canvas.ts');
    await e.newCanvas(128,128);context(e.layer.canvas).fillStyle='#00ff00';context(e.layer.canvas).fillRect(0,0,128,128);e.emit(true);
    const c=canvas(64,64),ctx=context(c);ctx.fillStyle='#ff0000';ctx.fillRect(0,0,32,64);ctx.fillStyle='#0000ff';ctx.fillRect(32,0,32,64);
    return [...new Uint8Array(await (await toPNG(c)).arrayBuffer())];
  });
  const file=path.resolve('test-results/import-source.png');await writeFile(file,new Uint8Array(fixture));
  await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);
  const dialog=page.getByRole('dialog',{name:'Import image',exact:true});
  const open=async()=>{await page.getByTitle('Import image layer',{exact:true}).click();await dialog.waitFor();};
  const state=()=>page.evaluate(async()=>{
    const {editor:e}=await import('/src/core/editor.ts');
    return {count:e.doc.layers.length,history:e.history.undoStack.length,id:e.layer.id,name:e.layer.name,active:e.doc.activeId,
      pixels:e.layer.canvas.toDataURL(),transform:e.transform?{width:e.transform.source.width,height:e.transform.source.height,
        corner:[...e.transform.source.getContext('2d').getImageData(Math.min(25,e.transform.source.width-1),Math.min(25,e.transform.source.height-1),1,1).data]}:null};
  });
  const coords=async(x,y)=>{
    const b=await page.getByTestId('import-preview').boundingBox(), s=Math.min((b.width-40)/64,(b.height-40)/64);
    return {x:b.x+(b.width-64*s)/2+x*s,y:b.y+(b.height-64*s)/2+y*s};
  };
  const clickPoint=async(x,y)=>{const p=await coords(x,y);await page.mouse.click(p.x,p.y);};
  const draw=async(points)=>{
    let p=await coords(...points[0]);await page.mouse.move(p.x,p.y);await page.mouse.down();
    for(const q of points.slice(1)){p=await coords(...q);await page.mouse.move(p.x,p.y,{steps:5});}await page.mouse.up();
  };
  const apply=async()=>{await page.getByRole('button',{name:'Next',exact:true}).click();await dialog.waitFor({state:'hidden'});};
  const confirm=()=>page.evaluate(async()=>{const {editor:e}=await import('/src/core/editor.ts');e.confirmTransform();});
  const layers=await page.locator('.layers-sidebar').boundingBox(), texture=await page.locator('.texture-pane').boundingBox();
  check(layers.x>texture.x && layers.y>=texture.y && layers.width<=301 && layers.height<=301 && layers.x+layers.width<=texture.x+texture.width+1,'Compact Layers panel stays inside the texture editor');
  check(await page.locator('.layer-footer').getByTitle('New empty layer',{exact:true}).count()===1&&
    await page.locator('.layer-footer').getByTitle('Import image layer',{exact:true}).count()===1,'New layer and image import buttons are in the bottom toolbar');
  check(await page.locator('.layer-footer > button').nth(0).getAttribute('title')==='Import image layer'&&await page.locator('.layer-footer > button').nth(1).getAttribute('title')==='New empty layer','Layer footer starts with image import, followed by new layer');
  const initial=await state();await open();
  check(await page.getByLabel('Import target layer',{exact:true}).inputValue()==='','Image import defaults to a new layer');
  check(await page.getByRole('toolbar',{name:'Import selection tools'}).locator('button[aria-pressed]').count()===4,'Import dialog offers four selection tools');
  await draw([[8,8],[24,24]]);
  check((await state()).pixels===initial.pixels && (await state()).history===initial.history,'Selecting an import region leaves the document and history untouched');
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  check((await state()).count===initial.count && (await state()).pixels===initial.pixels,'Canceling image import makes no document changes');
  await open();await draw([[8,8],[24,24]]);
  await draw([[24,24],[32,28]]);
  check(await dialog.getByText('24 × 20 px',{exact:true}).count()===1,'Import rectangle corner handle resizes the selection');
  await draw([[32,28],[24,24]]);
  await page.getByLabel('Import target layer',{exact:true}).selectOption(initial.id);
  await apply();let s=await state();
  check(s.count===initial.count&&s.id===initial.id&&Math.abs(s.transform.width-16)<=1&&Math.abs(s.transform.height-16)<=1,'Rectangle imports the selected source pixels into the chosen existing layer');
  check(await page.evaluate(async()=>{const {editor:e}=await import('/src/core/editor.ts');const ctx=e.layer.canvas.getContext('2d');return ctx.getImageData(2,2,1,1).data[0]===255&&ctx.getImageData(100,100,1,1).data[1]===255;}),'Import into an existing layer preserves its previous pixels outside the new fragment');
  await confirm();await open();await page.getByTitle('Lasso (L)',{exact:true}).click();await draw([[8,8],[40,8],[8,40],[8,8]]);await apply();s=await state();
  check(s.count===initial.count+1&&Math.abs(s.transform.width-32)<=1&&s.transform.corner[3]===0,'Lasso import preserves a non-rectangular transparent cutout');
  await confirm();await open();await page.getByTitle('Polygon (Shift+L)',{exact:true}).click();
  for(const q of [[8,8],[40,8],[40,40],[8,40]])await clickPoint(...q);
  check(await page.getByRole('button',{name:'Next',exact:true}).isDisabled(),'Unfinished polygon cannot accidentally import the entire image');
  check(await page.getByRole('button',{name:'Add',exact:true}).isDisabled(),'Add also waits until the polygon is finished');
  await page.keyboard.press('Enter');await draw([[40,40],[48,40]]);await apply();s=await state();
  check(Math.abs(s.transform.width-40)<=1&&Math.abs(s.transform.height-32)<=1,'Closed polygon vertex can be dragged before importing');
  await confirm();await open();await dialog.getByTitle('Magic wand (W)',{exact:true}).click();await page.getByLabel('Import wand tolerance',{exact:true}).fill('0');await clickPoint(8,32);await apply();s=await state();
  check(s.transform.width===32&&s.transform.height===64&&s.transform.corner[0]===255,'Magic wand selects and imports only the matching color region');
  await confirm();await open();await draw([[8,8],[24,24]]);await page.getByTitle('Whole image (Ctrl+A)',{exact:true}).click();await apply();s=await state();
  check(s.transform.width===64&&s.transform.height===64,'Whole image clears the selection and retains full native image dimensions');
  await confirm();await open();await draw([[8,8],[40,40]]);await page.screenshot({path:'test-results/import-dialog.png'});
  await page.keyboard.press('Escape');
  const beforeDrop=await state();
  await page.evaluate(bytes=>{
    const transfer=new DataTransfer();
    transfer.items.add(new File([new Uint8Array(bytes)],'same-name.png',{type:'image/png'}));
    transfer.items.add(new File([new Uint8Array(bytes)],'same-name.png',{type:'image/png'}));
    document.querySelector('.canvas-host').dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:transfer}));
  },fixture);
  await dialog.waitFor();
  const firstRequest=await page.evaluate(async()=>{const {editor:e}=await import('/src/core/editor.ts');return e.imageImport.id;});
  await draw([[8,8],[24,24]]);await page.keyboard.press('Escape');
  await page.waitForFunction(async id=>{const {editor:e}=await import('/src/core/editor.ts');return e.imageImport&&e.imageImport.id!==id;},firstRequest);
  await dialog.getByText('64 × 64 px',{exact:true}).waitFor();
  check(await page.getByLabel('Import target layer',{exact:true}).inputValue()==='','Dropped files each receive a fresh selection dialog and default new layer, even with identical names');
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  check((await state()).pixels===beforeDrop.pixels&&(await state()).count===beforeDrop.count,'Canceling queued drag-and-drop imports leaves the document unchanged');
  await page.evaluate(async()=>{const {editor:e}=await import('/src/core/editor.ts');e.setTool('brush');e.brushSize=20;e.emit();});
  await page.getByTitle('Fit canvas',{exact:true}).click();await page.getByTestId('texture-canvas').hover();
  const ring=page.getByTestId('brush-footprint');await ring.waitFor({state:'visible'});
  const b=await page.getByTestId('texture-canvas').boundingBox(), scale=Math.min((b.width-100)/128,(b.height-100)/128);
  check(Math.abs((await ring.boundingBox()).width-20*scale)<1,'Brush outline shows its diameter at the canvas zoom');
  await page.keyboard.press('BracketRight');check((await ring.boundingBox()).width>20*scale,'Brush outline updates immediately on size shortcut');
  await page.keyboard.press('KeyE');await ring.waitFor({state:'visible'});check(await ring.isVisible(),'Eraser also displays its size outline');
  await page.keyboard.down('Space');check(!(await ring.isVisible()),'Size outline hides during canvas panning');await page.keyboard.up('Space');
  await page.mouse.wheel(0,-200);await page.waitForTimeout(100);check((await ring.boundingBox()).width>25*scale,'Size outline follows zoom changes');
  await page.screenshot({path:'test-results/layers-right.png'});
  assert.deepEqual(errors,[]);
} finally {await app.close();await server.close();}
