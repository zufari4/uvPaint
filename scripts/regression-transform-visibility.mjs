import { _electron as electron } from 'playwright';
import { createServer } from 'vite';
import { readFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const server=await createServer();await server.listen();
const env={...process.env,UVPAINT_DEV_URL:'http://127.0.0.1:5173'};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({args:['.',`--user-data-dir=${process.cwd()}/test-results/transform-visibility-profile`],env});
const check=(value,label)=>{assert.ok(value,label);console.log('PASS',label);};
try {
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.waitForSelector('.empty-canvas');
  const models=[null];
  if(process.env.UVPAINT_TEST_MODEL)models.push((await readFile(process.env.UVPAINT_TEST_MODEL)).toString('base64'));
  for(const encoded of models){
    const name=encoded?'Real GLB':'Sample';
    await page.evaluate(async encoded=>{
      window.e=(await import('/src/core/editor.ts')).editor;
      e.cancelTransform();
      if(encoded)await e.importModel(Uint8Array.from(atob(encoded),c=>c.charCodeAt(0)),'Transform visibility.glb');
      else await e.sample();
      e.tool='move';e.emit();
      await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
      window.baseline={source:e.layer.canvas,pixels:e.output.toDataURL(),mask:e.layer.uvMask,history:e.history.undoStack.length,
        geometries:e.model.parts.map(p=>({geometry:p.geometry,index:p.geometry.index}))};
    },encoded);
    await page.getByTitle('Fit canvas',{exact:true}).click();
    const point=await page.evaluate(()=>{
      const r=document.querySelector('[data-testid=texture-canvas]').getBoundingClientRect(),panel=document.querySelector('.layers-sidebar').getBoundingClientRect();
      const z=Math.min((r.width-100)/e.doc.width,(r.height-100)/e.doc.height),ox=r.x+(r.width-e.doc.width*z)/2,oy=r.y+(r.height-e.doc.height*z)/2;
      const candidates=e.doc.islands.flatMap(i=>i.triangles.map(([a,b,c])=>{
        const x=ox+(a.x+b.x+c.x)/3*e.doc.width*z,y=oy+(a.y+b.y+c.y)/3*e.doc.height*z;
        return {x,y,area:Math.abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x))};
      })).filter(p=>p.x>r.x+20&&p.x<r.right-20&&p.y>r.y+20&&p.y<r.bottom-40&&!(p.x>=panel.x&&p.x<=panel.right&&p.y>=panel.y&&p.y<=panel.bottom));
      return candidates.sort((a,b)=>b.area-a.area)[0];
    });
    assert.ok(point);
    const unchanged=()=>page.evaluate(()=>e.layer.canvas===baseline.source&&e.layer.uvMask===baseline.mask&&e.output.toDataURL()===baseline.pixels&&e.history.undoStack.length===baseline.history&&e.hiddenFaces.size===0);
    await page.mouse.click(point.x,point.y);
    check(await page.evaluate(()=>e.doc.selectedIslands.length===1&&!!e.transform)&&await unchanged(),`${name}: Transform click selects an island without changing pixels, mask, 3D texture or history`);
    await page.evaluate(()=>{window.clickedIsland=e.doc.selectedIslands[0];});
    await page.mouse.click(point.x,point.y);
    check(await unchanged(),`${name}: Repeated island click remains non-destructive`);
    await page.getByTestId('texture-canvas').click({position:{x:5,y:50}});
    check(await page.evaluate(()=>!e.transform&&!e.doc.selectedIslands.length&&!e.textureIsolated&&e.visibleIslands.length===e.doc.islands.length)&&await unchanged(),`${name}: Blank click clears the frame and restores the complete 2D view`);
    check(await page.evaluate(()=>e.model.parts.every((p,i)=>p.geometry===baseline.geometries[i].geometry&&p.geometry.index===baseline.geometries[i].index)),`${name}: Selection does not rebuild or hide 3D geometry`);
    await page.getByTitle('Move / transform (V)',{exact:true}).click();
    await page.getByTestId('texture-canvas').focus();await page.keyboard.press('Enter');
    check(await unchanged(),`${name}: Applying an untouched frame preserves exact pixels and adds no undo step`);
    await page.evaluate(()=>{
      e.beginTransform();const p=e.transform.original.map(p=>({...p}));
      e.updateTransform(p.map(p=>({x:p.x+10,y:p.y})));e.updateTransform(p);e.confirmTransform();
    });
    check(await unchanged(),`${name}: Moving back to the starting position restores the exact original layer`);
    const moved=await page.evaluate(()=>{
      e.selectIsland(0);e.beginTransform();e.updateTransform(e.transform.points.map(p=>({x:p.x+10,y:p.y})));e.confirmTransform();
      const valid=e.layer.uvMask===baseline.mask&&!e.hiddenFaces.size&&e.history.undoStack.length===baseline.history+1;
      e.undo();return valid;
    });
    check(moved&&await unchanged(),`${name}: Actual transforms retain the layer mask and Undo restores pixels`);
    await page.evaluate(async()=>{
      const {TextureVisibility}=await import('/src/render/texture-visibility.ts');
      const {islandMask}=await import('/src/tools/uv.ts');
      e.selectIsland(e.doc.islands[Math.min(15,e.doc.islands.length-1)].id);e.setIslandVisibility('isolate');e.beginTransform();
      window.manualView=new TextureVisibility();window.manualSet=e.hiddenFaces;window.manualHistory=e.history.undoStack.length;
      const mask=islandMask({...e.doc,islands:e.visibleIslands,selectedIslands:[]});
      window.allowedPixels=mask.getContext('2d').getImageData(0,0,e.doc.width,e.doc.height).data;
      window.countLeakedPixels=()=>{
        manualView.update(e.doc,e.textureHiddenFaces,e.visibleIslands,e.textureIsolated);
        const out=manualView.render(e.output,e.transform?.outside,.4)??e.output;
        const rgba=out.getContext('2d').getImageData(0,0,e.doc.width,e.doc.height).data;
        let leaked=0;for(let i=3;i<rgba.length;i+=4)if(rgba[i]&&!allowedPixels[i])leaked++;
        return leaked;
      };
    });
    const initialLeaks=await page.evaluate(()=>countLeakedPixels());
    check(initialLeaks===0,`${name}: Manual isolation leaves no texture fringe outside visible islands (${initialLeaks} leaked pixels)`);
    await mkdir('test-results',{recursive:true});
    await page.screenshot({path:`test-results/manual-isolation-${encoded?'glb':'sample'}.png`});
    const rotation=await page.evaluate(()=>{
      const r=document.querySelector('[data-testid=texture-canvas]').getBoundingClientRect(),z=Math.min((r.width-100)/e.doc.width,(r.height-100)/e.doc.height);
      const p=e.transform.points,cx=(p[0].x+p[2].x)/2,cy=(p[0].y+p[2].y)/2,radius=(p[2].y-p[0].y)/2+22/z;
      const ox=r.x+(r.width-e.doc.width*z)/2,oy=r.y+(r.height-e.doc.height*z)/2,angle=-17*Math.PI/180;
      return {from:{x:ox+cx*z,y:oy+(cy-radius)*z},to:{x:ox+(cx+radius*Math.sin(angle))*z,y:oy+(cy-radius*Math.cos(angle))*z}};
    });
    await page.mouse.move(rotation.from.x,rotation.from.y);await page.mouse.down();await page.mouse.move(rotation.to.x,rotation.to.y,{steps:12});
    check(await page.evaluate(()=>countLeakedPixels()===0&&e.hiddenFaces===manualSet),`${name}: Live rotation stays inside visible UV faces without revealing hidden fragments`);
    await page.mouse.up();
    check(await page.evaluate(()=>countLeakedPixels()===0&&Math.abs(e.transform.points[1].y-e.transform.points[0].y)>1),`${name}: Actual pointer rotation finishes without stray texture fragments`);
    check(await page.evaluate(()=>manualView.rebuilds===1),`${name}: Rotation reuses the UV visibility mask`);
    await page.screenshot({path:`test-results/manual-rotation-${encoded?'glb':'sample'}.png`});
    await page.keyboard.press('Enter');
    check(await page.evaluate(()=>countLeakedPixels()===0&&e.history.undoStack.length===manualHistory+1&&e.layer.uvMask===baseline.mask),`${name}: Apply preserves the layer mask and manual visibility`);
    await page.keyboard.press('Control+z');
    check(await page.evaluate(()=>e.output.toDataURL()===baseline.pixels&&e.hiddenFaces===manualSet&&countLeakedPixels()===0),`${name}: Undo restores exact pixels while keeping manual isolation`);
    await page.evaluate(()=>{e.setIslandVisibility('all');e.clearCanvasSelection();});
    check(await unchanged(),`${name}: Show all restores the complete untouched texture after undo`);
    await page.evaluate(()=>{e.addEmpty();e.setLayerIsland(window.clickedIsland);e.selectLayer(e.layer.id);window.boundLayer=e.layer.id;window.boundMask=e.layer.uvMask;window.boundHistory=e.history.undoStack.length;window.boundOutput=e.output.toDataURL();});
    check(await page.evaluate(()=>e.textureIsolated&&e.visibleIslands.length===1&&!e.hiddenFaces.size),`${name}: Linked-layer focus isolates only 2D`);
    await page.getByTestId('texture-canvas').click({position:{x:5,y:50}});
    check(await page.evaluate(()=>!e.textureIsolated&&e.visibleIslands.length===e.doc.islands.length&&e.layer.uvMask===window.boundMask&&!!e.layer.uvBinding&&e.output.toDataURL()===window.boundOutput&&e.history.undoStack.length===window.boundHistory),`${name}: Clearing focus preserves the layer binding and restores other islands`);
    await page.mouse.click(point.x,point.y);
    check(await page.evaluate(()=>e.layer.id===window.boundLayer&&e.textureIsolated&&e.visibleIslands.length===1&&e.visibleIslands[0].id===window.clickedIsland&&!e.hiddenFaces.size&&e.output.toDataURL()===window.boundOutput),`${name}: clicking an already-active bound island restores 2D-only isolation`);
    check(await page.evaluate(()=>e.model.parts.every((p,i)=>p.geometry.index.count===baseline.geometries[i].index.count)),`${name}: 2D linked-island selection leaves all 3D faces visible`);
    await page.evaluate(()=>{e.selectIsland(1);e.setIslandVisibility('except');window.manualHidden=e.hiddenFaces;e.selectLayer(e.layer.id);});
    await page.getByTestId('texture-canvas').click({position:{x:5,y:50}});
    check(await page.evaluate(()=>!e.textureIsolated&&e.hiddenFaces===window.manualHidden&&e.hiddenFaces.size>0),`${name}: Blank clicks preserve explicit manual hiding`);
    await page.evaluate(()=>{e.setIslandVisibility('all');e.selectLayer(e.doc.layers[0].id);e.clearCanvasSelection();});
    await mkdir('test-results',{recursive:true});
    await page.screenshot({path:`test-results/transform-visibility-${encoded?'glb':'sample'}.png`});
  }
  assert.deepEqual(errors,[]);
} finally {await app.close();await server.close();}
