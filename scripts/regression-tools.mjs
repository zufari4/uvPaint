import { _electron as electron } from 'playwright';
import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const server=await createServer();await server.listen();
const env={...process.env,UVPAINT_DEV_URL:'http://127.0.0.1:5173'};delete env.ELECTRON_RUN_AS_NODE;
const profile=path.resolve('test-results/tools-profile');
const app=await electron.launch({args:['.',`--user-data-dir=${profile}`],env});
const check=(v,label)=>{assert.ok(v,label);console.log('PASS',label);};
try {
  const page=await app.firstWindow();await page.waitForSelector('.empty-canvas');
  await page.evaluate(()=>{localStorage.removeItem('uvpaint.toolOptions');localStorage.removeItem('uvpaint.layersCollapsed');});
  await page.reload();await page.waitForSelector('.empty-canvas');
  await page.evaluate(async()=>{window.e=(await import('/src/core/editor.ts')).editor;window.PaintStroke=(await import('/src/tools/paint.ts')).PaintStroke;
    window.composite=(await import('/src/render/composite.ts')).composite;});

  // File dialogs reopen in the last used folder.
  const folder=path.resolve('test-results/folder-check');await mkdir(folder,{recursive:true});
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==','base64');
  await writeFile(path.join(folder,'pixel.png'),png);
  await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async(_w,options)=>{globalThis.lastDialog=options;return {canceled:false,filePaths:[file]};};},path.join(folder,'pixel.png'));
  await page.evaluate(()=>window.desktop.openFile('image'));await page.evaluate(()=>window.desktop.openFile('image'));
  check(await app.evaluate(()=>globalThis.lastDialog.defaultPath)===folder,'Image dialogs reopen in the last used folder');

  await page.evaluate(()=>e.newCanvas(256,256));
  await page.getByTitle('Fit canvas',{exact:true}).click();
  const box=await page.getByTestId('texture-canvas').boundingBox();
  const zoom=Math.min((box.width-100)/256,(box.height-100)/256);
  const at=(x,y)=>[box.x+(box.width-256*zoom)/2+x*zoom,box.y+(box.height-256*zoom)/2+y*zoom];
  const alpha=(x,y)=>page.evaluate(([x,y])=>e.layer.canvas.getContext('2d').getImageData(x,y,1,1).data[3],[x,y]);

  // Line: two clicks place editable end points; Enter applies.
  await page.evaluate(()=>{e.addEmpty();e.color='#ff0000';e.brushSize=6;e.setTool('line');});
  const undo0=await page.evaluate(()=>e.history.undoStack.length);
  await page.mouse.click(...at(30,40));
  check(await page.evaluate(()=>!!e.lineEdit&&!e.lineEdit.placed),'First click places the first line point');
  await page.mouse.click(...at(130,40));await page.waitForTimeout(100);
  check(await page.evaluate(()=>e.lineEdit?.placed)&&await alpha(80,40)>200&&await page.evaluate(()=>e.history.undoStack.length)===undo0,'Second click draws the line without applying it yet');
  await page.mouse.move(...at(130,40));await page.mouse.down();await page.mouse.move(...at(130,120),{steps:5});await page.mouse.up();await page.waitForTimeout(100);
  check(await alpha(80,40)===0&&await alpha(80,80)>200,'Dragging an end point reshapes the pending line');
  await page.getByTestId('texture-canvas').focus();await page.keyboard.press('Enter');
  check(await page.evaluate(u=>!e.lineEdit&&e.history.undoStack.at(-1).label==='Line'&&e.history.undoStack.length===u+1,undo0),'Enter applies the line as one undo step');
  await page.mouse.move(...at(30,200));await page.mouse.down();await page.mouse.move(...at(200,200),{steps:6});await page.mouse.up();await page.waitForTimeout(100);
  check(await page.evaluate(()=>e.lineEdit?.placed)&&await alpha(120,200)>200,'Dragging still draws a line in one gesture');
  await page.keyboard.press('Escape');
  check(await page.evaluate(()=>!e.lineEdit)&&await alpha(120,200)===0,'Escape discards the pending line');

  // Polygon lasso keeps its outline while panning with the middle button.
  await page.evaluate(()=>{e.setTool('polygon');});
  await page.mouse.click(...at(20,20));await page.mouse.click(...at(120,20));
  const viewWhite=()=>page.evaluate(()=>{const v=document.querySelector('[data-testid=texture-canvas]'),d=v.getContext('2d').getImageData(0,0,v.width,v.height).data;let n=0;for(let i=0;i<d.length;i+=4)if(d[i]>235&&d[i+1]>235&&d[i+2]>235)n++;return n;});
  const before=await viewWhite();
  const mid=[box.x+box.width/2,box.y+box.height/2];
  await page.mouse.move(...mid);await page.mouse.down({button:'middle'});await page.mouse.move(mid[0]+40,mid[1]+30,{steps:4});await page.mouse.up({button:'middle'});
  await page.waitForTimeout(100);
  check(before>20&&await viewWhite()>before*0.5,'Middle-button panning keeps the unfinished polygon outline');
  await page.evaluate(()=>e.setTool('brush'));

  // Aligned clone stamp.
  await page.evaluate(()=>{
    const x=e.layer.canvas.getContext('2d');x.fillStyle='#00ff00';x.fillRect(0,0,256,128);x.fillStyle='#ff0000';x.fillRect(0,128,256,128);e.emit(true);
    e.setTool('clone');e.brushSize=8;e.cloneSource={x:20,y:200};e.cloneOffset=null;e.brushOpacity=1;
    for(const p of [{x:120,y:200},{x:120,y:40}]){const s=new PaintStroke(e,p);s.finish();}
  });
  const cloned=await page.evaluate(()=>[...e.layer.canvas.getContext('2d').getImageData(120,40,1,1).data]);
  check(cloned[1]===255&&cloned[0]===0,'Clone keeps its offset between strokes, so the source moves with the brush');
  await page.mouse.move(...at(60,60));
  check(await page.getByTestId('clone-source').isVisible(),'Clone source marker follows the pointer');

  // Paint opacity comes from the color alpha; eraser and clone work at full strength.
  const opacity=await page.evaluate(()=>{e.setTool('brush');e.setColor('primary','#123456',.3);const brush=e.brushOpacity;e.setTool('eraser');const eraser=e.brushOpacity;e.setTool('brush');
    return {brush,eraser,again:e.brushOpacity};});
  check(opacity.brush===.3&&opacity.eraser===1&&opacity.again===.3,'Brush opacity follows the primary color alpha; the eraser stays at full strength');
  check(await page.getByLabel('Brush opacity').count()===0,'Tool options no longer have a separate Opacity field');
  const soft=await page.evaluate(()=>{e.addEmpty();e.color='#000000';e.brushOpacity=1;e.brushSize=40;
    e.brushHardness=1;new PaintStroke(e,{x:60,y:60}).finish();e.brushHardness=0;new PaintStroke(e,{x:180,y:60}).finish();
    const d=e.layer.canvas.getContext('2d');const a=(x,y)=>d.getImageData(x,y,1,1).data[3];return {hard:a(76,60),soft:a(196,60),center:a(180,60)};});
  check(soft.hard>240&&soft.soft<160&&soft.center>200,`Hardness softens brush edges (${JSON.stringify(soft)})`);

  // Undo keeps every stroke in a large layer stack.
  const depth=await page.evaluate(async()=>{
    await e.newCanvas(2048,2048);for(let i=0;i<39;i++)e.addEmpty();
    const start=e.history.undoStack.length;e.setTool('brush');e.brushSize=30;
    for(let i=0;i<12;i++){const s=new PaintStroke(e,{x:100+i*50,y:100});s.draw({x:100+i*50,y:400});s.finish();}
    const after=e.history.undoStack.length;let undone=0;
    for(let i=0;i<12;i++){const before=e.layer.canvas;e.undo();if(e.layer.canvas!==before)undone++;}
    return {added:after-start,undone,remaining:e.layer.canvas.getContext('2d').getImageData(100,200,1,1).data[3]};
  });
  check(depth.added===12&&depth.undone===12&&depth.remaining===0,`Undo restores all strokes with 40 layers (${JSON.stringify(depth)})`);

  // Cached preview compositing matches a full composite.
  const diff=await page.evaluate(async()=>{
    await e.newCanvas(64,64);
    for(let i=0;i<5;i++){e.addEmpty();const x=e.layer.canvas.getContext('2d');x.fillStyle=`rgba(${i*50},${200-i*30},${i*40},${.3+i*.1})`;x.fillRect(i*8,i*6,30,30);}
    e.selectLayer(e.doc.layers[2].id);const x=e.layer.canvas.getContext('2d');x.fillStyle='rgba(255,255,0,.5)';x.fillRect(10,10,40,40);e.emit(true);
    const a=e.output.getContext('2d').getImageData(0,0,64,64).data,b=composite(e.doc).getContext('2d').getImageData(0,0,64,64).data;
    let max=0;for(let i=0;i<a.length;i++)max=Math.max(max,Math.abs(a[i]-b[i]));return max;
  });
  check(diff<=2,`Cached preview equals the full composite (max channel difference ${diff})`);

  // Painting and selecting beyond the island keep the island focus; Escape or the options button leave it.
  const focus=await page.evaluate(()=>{
    const face={meshId:'m',triangle:0,vertices:[],normal:[0,0,1]};
    const square=(id,x0,x1)=>({id,triangles:[[{x:x0,y:.1},{x:x1,y:.1},{x:x1,y:.9}],[{x:x0,y:.1},{x:x1,y:.9},{x:x0,y:.9}]],faces:[face,face]});
    e.doc.islands=[square(0,.05,.3),square(1,.6,.95)];e.setLayerIsland(1);e.selectLayer(e.layer.id);e.setTool('eraser');return e.textureIsolated;
  });
  await page.getByTitle('Fit canvas',{exact:true}).click();
  const b2=await page.getByTestId('texture-canvas').boundingBox(),z2=Math.min((b2.width-100)/64,(b2.height-100)/64);
  const blank=[b2.x+(b2.width-64*z2)/2+29*z2,b2.y+(b2.height-64*z2)/2+32*z2];
  await page.mouse.click(...blank);
  const erased=await page.evaluate(()=>e.textureIsolated);
  await page.keyboard.press('m');
  await page.mouse.move(...blank);await page.mouse.down();await page.mouse.move(blank[0]+40,blank[1]+30,{steps:3});await page.mouse.up();
  const selected=await page.evaluate(()=>e.textureIsolated&&!!e.doc.selection);
  check(focus&&erased&&selected,'Erasing or selecting beyond the island keeps the island focus');
  await page.keyboard.press('Escape');
  check(await page.evaluate(()=>!e.textureIsolated),'Escape with nothing to cancel shows all layers');
  await page.evaluate(()=>{e.deselect();e.setLayerIsland(1);});
  await page.getByRole('button',{name:'Show all layers (Esc)'}).click();
  check(await page.evaluate(()=>!e.textureIsolated),'The options bar button shows all layers');

  // Collapsible Layers panel.
  await page.getByTitle('Collapse layers panel',{exact:true}).click();
  check(await page.locator('.layers-sidebar').count()===0&&await page.getByRole('button',{name:'Show layers'}).isVisible(),'Layers panel collapses to a side tab');
  await page.getByRole('button',{name:'Show layers'}).click();
  check(await page.locator('.layers-sidebar').count()===1,'The side tab restores the Layers panel');
} finally {await app.close();await server.close();}
