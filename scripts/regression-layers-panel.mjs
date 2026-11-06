import { _electron as electron } from 'playwright';
import { createServer } from 'vite';
import assert from 'node:assert/strict';
const server=await createServer();await server.listen();
const env={...process.env,UVPAINT_DEV_URL:'http://127.0.0.1:5173'};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({args:['.',`--user-data-dir=${process.cwd()}/test-results/layers-panel-profile`],env});
try {
  const page=await app.firstWindow();await page.waitForSelector('.empty-canvas');
  await page.evaluate(async()=>{window.e=(await import('/src/core/editor.ts')).editor;});
  await page.evaluate(()=>e.newCanvas(64,64));
  await page.waitForSelector('.layer-row');
  const names=await page.evaluate(()=>{
    e.addEmpty();e.addEmpty();e.selectLayer(e.doc.layers[0].id);e.addEmpty();
    const afterAdd=e.doc.layers.map(l=>l.name);
    e.selectLayer(e.doc.layers[0].id);e.clipboard=e.layer.canvas;e.paste();
    return {afterAdd,afterPaste:e.doc.layers.map(l=>l.name),active:e.doc.layers.findIndex(l=>l.id===e.doc.activeId)};
  });
  assert.deepEqual(names.afterAdd,['Layer 1','Layer 4','Layer 2','Layer 3']);
  assert.equal(names.afterPaste[1],'Pasted fragment');assert.equal(names.active,1);
  console.log('PASS New and pasted layers go directly above the selected layer');
  const footer=await page.locator('.layer-footer > button').evaluateAll(b=>b.map(x=>x.title));
  assert.deepEqual(footer.slice(0,3),['Import image layer','New empty layer','Delete layer']);
  const panel=await page.evaluate(()=>{const p=document.querySelector('.layers-sidebar'),f=p.querySelector('.layer-footer');
    return {width:p.getBoundingClientRect().width,fits:f.scrollWidth<=f.clientWidth+1,text:p.querySelector('.layer-properties').textContent,
      rowSmall:[...p.querySelectorAll('.layer-row small')].map(s=>s.textContent)};});
  assert.ok(panel.width<300&&panel.fits,`compact panel fits its toolbar (${panel.width}px)`);
  assert.ok(!/Opacity/.test(panel.text));assert.deepEqual(panel.rowSmall,[]);
  console.log(`PASS Compact ${Math.round(panel.width)}px panel, delete next to +, no Opacity word or opacity badges`);
  const expected=await page.evaluate(()=>{
    const face={meshId:'m',triangle:0,vertices:[],normal:[0,0,1]};
    const square=(id,x0,x1)=>({id,triangles:[[{x:x0,y:.1},{x:x1,y:.1},{x:x1,y:.9}],[{x:x0,y:.1},{x:x1,y:.9},{x:x0,y:.9}]],faces:[face,face]});
    e.doc.islands=[square(0,.05,.3),square(23,.6,.95)];
    window.target=e.doc.islands[1];
    const x=e.layer.canvas.getContext('2d');x.fillStyle='#ff0000';x.fillRect(0,0,e.doc.width,e.doc.height);
    e.setLayerIsland(target.id);e.selectLayer(e.layer.id);e.emit(true);
    return String(target.id+1).padStart(2,'0');
  });
  const label=await page.locator('.layer-row.selected .layer-island-label').textContent();
  assert.equal(label,expected);
  console.log('PASS Linked layers show only the island number');
  await page.getByTitle('Fit canvas',{exact:true}).click();
  await page.waitForTimeout(200);
  const faint=await page.evaluate(()=>{
    const d=e.doc,view=document.querySelector('[data-testid=texture-canvas]'),r=view.getBoundingClientRect(),panel=document.querySelector('.layers-sidebar').getBoundingClientRect();
    const ratio=view.width/r.width,z=Math.min((r.width-100)/d.width,(r.height-100)/d.height),ox=(r.width-d.width*z)/2,oy=(r.height-d.height*z)/2;
    const ctx=view.getContext('2d');
    const sample=(x,y)=>{const sx=ox+x*z,sy=oy+y*z;
      if(r.x+sx>=panel.x&&r.x+sx<=panel.right&&r.y+sy>=panel.y&&r.y+sy<=panel.bottom)return null;
      return [...ctx.getImageData(Math.round(sx*ratio),Math.round(sy*ratio),1,1).data];};
    return {gap:sample(30,32),other:sample(10,32)};
  });
  assert.ok(faint.gap&&faint.gap[0]>115&&faint.gap[0]<165&&faint.gap[1]<80,`outside pixels show at about 40% (${JSON.stringify(faint)})`);
  assert.ok(faint.other&&faint.other[0]>115&&faint.other[0]<165,`the faint area also covers other islands without holes (${JSON.stringify(faint)})`);
  console.log('PASS Focused layer pixels outside its island stay visible at 40% opacity, also over other islands');
  await page.evaluate(()=>e.clearCanvasSelection());
  await page.waitForTimeout(100);
  const cleared=await page.evaluate(()=>{
    const d=e.doc,view=document.querySelector('[data-testid=texture-canvas]'),r=view.getBoundingClientRect();
    const ratio=view.width/r.width,z=Math.min((r.width-100)/d.width,(r.height-100)/d.height),ox=(r.width-d.width*z)/2,oy=(r.height-d.height*z)/2;
    return [...view.getContext('2d').getImageData(Math.round((ox+30*z)*ratio),Math.round((oy+32*z)*ratio),1,1).data];
  });
  assert.ok(cleared[0]<90,`clearing the island focus hides the faint area (${cleared})`);
  console.log('PASS Clicking empty space removes the faint area of the last focused layer');
  await page.evaluate(()=>{e.duplicateLayer();for(let i=0;i<10;i++)e.addEmpty();});
  await page.waitForTimeout(100);
  const revealed=await page.evaluate(async()=>{
    const list=document.querySelector('.layer-list');list.scrollTop=list.scrollHeight;
    await new Promise(requestAnimationFrame);
    const linked=e.doc.layers.slice().reverse().find(l=>l.uvBinding?.island.id===target.id);
    e.selectCanvasIsland(target.id);
    await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
    const row=document.querySelector(`[data-layer-id="${linked.id}"]`).getBoundingClientRect(),box=list.getBoundingClientRect();
    return {scrollable:list.scrollHeight>list.clientHeight,visible:row.top>=box.top-1&&row.bottom<=box.bottom+1,active:e.layer.id===linked.id};
  });
  assert.ok(revealed.scrollable&&revealed.visible,`selecting an island scrolls to its first linked layer (${JSON.stringify(revealed)})`);
  console.log('PASS Selecting an island scrolls the Layers panel to the first linked layer');
} finally {await app.close();await server.close();}
