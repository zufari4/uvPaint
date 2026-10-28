import { _electron as electron } from 'playwright';
import { createServer } from 'vite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const server=await createServer();await server.listen();
const env={...process.env,UVPAINT_DEV_URL:'http://127.0.0.1:5173'};delete env.ELECTRON_RUN_AS_NODE;
let app=await electron.launch({args:['.',`--user-data-dir=${process.cwd()}/test-results/project-profile`],env});
const ok=(v,label)=>{assert.ok(v,label);console.log('PASS',label);};
try {
  let page=await app.firstWindow();await page.waitForSelector('.empty-canvas');await mkdir('test-results',{recursive:true});
  const tests=await page.evaluate(async()=>{
    const {editor:e,Editor}=await import('/src/core/editor.ts');
    const {canvas,context,toPNG}=await import('/src/core/canvas.ts');
    const {polygonMask}=await import('/src/tools/selection.ts');
    const THREE=await import('/node_modules/three/build/three.module.js');
    const {GLTFExporter}=await import('/node_modules/three/examples/jsm/exporters/GLTFExporter.js');
    const log=[],check=(v,label)=>{if(!v)throw new Error(label);log.push(label);};
    const color=canvas(64,64);context(color).fillStyle='#ca5522';context(color).fillRect(0,0,64,64);
    const ao=canvas(64,64);context(ao).fillStyle='#ffffff';context(ao).fillRect(32,0,32,64);
    const baseMap=new THREE.CanvasTexture(color);baseMap.channel=1;baseMap.name='base-color';baseMap.flipY=false;
    const aoMap=new THREE.CanvasTexture(ao);aoMap.name='ao-and-mask';aoMap.flipY=false;
    const mat=new THREE.MeshStandardMaterial({map:baseMap,aoMap,alphaTest:.4});mat.name='Body';
    const geometry=new THREE.PlaneGeometry(2,2);const uv1=geometry.getAttribute('uv').clone();
    for(let i=0;i<uv1.count;i++)uv1.setX(i,1-uv1.getX(i));geometry.setAttribute('uv1',uv1);
    const scene=new THREE.Scene();scene.add(new THREE.Mesh(geometry,mat));
    const second=new THREE.Mesh(geometry.clone(),mat);second.position.x=3;scene.add(second);
    const trim=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:'#777777'}));trim.position.y=3;scene.add(trim);
    const glb=await new GLTFExporter().parseAsync(scene,{binary:true});
    await e.importModel(new Uint8Array(glb),'portable.glb');
    const baseId=e.activeId;
    const source=canvas(128,64);context(source).fillStyle='#dd22aa';context(source).fillRect(0,0,128,64);
    await e.importImage(new Uint8Array(await(await toPNG(source)).arrayBuffer()),'off-canvas-source.png');
    e.updateTransform(e.transform.points.map(p=>({x:p.x-16,y:p.y})));e.confirmTransform();e.setLayerIsland(1);
    e.updateLayer(e.layer.id,{name:'Bound artwork',opacity:.6,blend:'multiply'});
    e.change('Document settings',d=>{d.uvNames={uv1:'Color UV',uv:'AO UV'};d.alphaMode='MASK';d.alphaCutoff=.32;});
    e.setSelection(polygonMask(64,64,[{x:4,y:4},{x:30,y:4},{x:30,y:40},{x:4,y:40}]));
    e.selectIsland(1);e.setIslandVisibility('isolate');e.model.parts[2].visible=false;
    e.selectUVSet('uv');e.addEmpty();e.setLayerIsland(0);e.color='#00ff00';e.fill({x:12,y:12});
    e.selectMaterial(e.model.slots[1].id);await e.newCanvas(64,64);e.addEmpty();e.color='#2255dd';e.fill({x:20,y:20});
    e.selectMaterial(baseId);e.tool='eraser';e.brushSize=47;e.brushOpacity=.7;e.previewEdges=true;e.previewMode='unlit';
    const fingerprint=editor=>{
      const key=d=>`${d.id}:${d.sourceIndex??-1}`;
      const stored=new Map([...editor.textureDocuments.values()].map(d=>[key(d),d]));
      for(const d of editor.docs.values())stored.set(key(d),d);
      const docs=editor.model?editor.model.slots.flatMap(slot=>slot.documents.map(d=>stored.get(key(d))??d)):[...editor.docs.values()];
      const part=id=>editor.model?.parts.findIndex(p=>p.uuid===id)??-1;
      return {active:docs.indexOf(editor.doc),open:[...editor.docs.values()].map(d=>docs.indexOf(d)),
        visible:editor.model?.parts.map(p=>p.visible),hidden:[...editor.hiddenFaces].map(f=>{const i=f.lastIndexOf(':');return `${part(f.slice(0,i))}:${f.slice(i+1)}`;}).sort(),
        preview:[editor.previewMode,editor.previewEdges],paint:[editor.tool,editor.color,editor.brushSize,editor.brushOpacity],
        docs:docs.map(d=>({name:d.name,width:d.width,height:d.height,uv:d.uvSet,names:d.uvNames,alpha:[d.alphaMode,d.alphaCutoff],
          active:d.activeId,restrict:d.restrict,selection:d.selection?.toDataURL(),selected:d.selectedIslands,
          layers:d.layers.map(l=>({id:l.id,name:l.name,visible:l.visible,opacity:l.opacity,blend:l.blend,pixels:l.canvas.toDataURL(),mask:l.uvMask?.toDataURL(),
            binding:l.uvBinding?{uv:l.uvBinding.uvSet,id:l.uvBinding.island.id,faces:l.uvBinding.island.faces?.map(f=>[part(f.meshId),f.triangle])}:null,
            placement:l.placement?.rendered===l.canvas?{source:l.placement.source.toDataURL(),rest:l.placement.rest.toDataURL(),points:l.placement.points,kind:l.placement.kind}:null}))}))};
    };
    const before=fingerprint(e), oldModel=e.model, bytes=await e.projectBytes();
    await e.importProject(bytes,'roundtrip.uvpaint');
    check(e.model!==oldModel&&JSON.stringify(fingerprint(e))===JSON.stringify(before),'Portable GLB project restores all materials/textures, layer pixels/properties, masks, selections and view state');
    check(e.model.source.bytes.length===glb.byteLength,'Original GLB is embedded in the project');
    check(e.history.undoStack.length===0,'Opened project starts a fresh undo history');
    const main=e.model.slots[0];e.selectMaterial(main.id);e.selectUVSet('uv1');
    check(e.doc.layers[1].uvBinding.island.faces[0].meshId===e.model.parts[1].uuid,'UV binding face links remap to the reloaded model mesh');
    e.deselect();e.selectLayer(e.doc.layers[1].id);e.beginTransform();
    check(e.transform.source.width===128,'Saved placement retains its full off-canvas image source');e.cancelTransform();
    const json=bytes=>JSON.parse(new TextDecoder().decode(bytes.subarray(16,16+new DataView(bytes.buffer).getUint32(8,true))));
    const rewrite=(data,change)=>{const oldLength=new DataView(data.buffer).getUint32(8,true),m=json(data);change(m);const next=new TextEncoder().encode(JSON.stringify(m)),out=new Uint8Array(16+next.length+data.length-16-oldLength);out.set(data.subarray(0,16));new DataView(out.buffer).setUint32(8,next.length,true);out.set(next,16);out.set(data.subarray(16+oldLength),16+next.length);return out;};
    for(const bad of [bytes.subarray(0,bytes.length-9),rewrite(bytes,m=>m.version=99),rewrite(bytes,m=>m.documents[0].layers[0].canvas=999999),rewrite(bytes,m=>m.documents[0].layers[1].uvBinding.island.faces[0].triangle=999999)]){
      const current=e.model,currentDoc=e.doc;let rejected=false;try{await e.importProject(bad,'broken.uvpaint');}catch{rejected=true;}
      check(rejected&&e.model===current&&e.doc===currentDoc,'Invalid or truncated project is rejected without changing the current workspace');
    }
    const standalone=new Editor();await standalone.newCanvas(128,64);context(standalone.layer.canvas).fillStyle='#aabbcc80';context(standalone.layer.canvas).fillRect(2,2,40,40);
    const single=await standalone.projectBytes(),expected=standalone.layer.canvas.toDataURL();await standalone.importProject(single,'texture.uvpaint');
    check(!standalone.model&&standalone.layer.canvas.toDataURL()===expected,'Standalone projects restore transparent pixels without requiring a model');
    await standalone.sample();standalone.selectIsland(0);standalone.setIslandVisibility('except');const sample=await standalone.projectBytes();await standalone.importProject(sample,'sample.uvpaint');
    check(standalone.model.parts.length===2&&standalone.hiddenFaces.size===2,'Built-in sample projects restore without external files');
    await e.importProject(bytes,'native.uvpaint');
    window.projectExpected=fingerprint(e);window.projectFingerprint=()=>fingerprint(e);window.projectEditor=e;
    return log;
  });
  tests.forEach(label=>console.log('PASS',label));
  const file=path.resolve('test-results/native.uvpaint'),copy=path.resolve('test-results/copy.uvpaint');
  await app.evaluate(({dialog},file)=>{globalThis.projectSaveDialogs=0;dialog.showSaveDialog=async()=>{globalThis.projectSaveDialogs++;return {canceled:false,filePath:file};};},file);
  await page.getByTestId('texture-canvas').focus();await page.keyboard.press('Control+s');
  await page.waitForFunction(()=>!window.projectEditor.busy&&window.projectEditor.notice?.text.startsWith('Project saved:'));
  const saved=await readFile(file);ok(saved.subarray(0,8).toString()==='UVPAINT1','Ctrl+S writes a native .uvpaint project');
  await page.keyboard.press('Control+s');await page.waitForFunction(()=>!window.projectEditor.busy);
  ok(await app.evaluate(()=>globalThis.projectSaveDialogs)===1,'Further Ctrl+S saves overwrite the chosen project without a second dialog');
  await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},copy);
  await page.keyboard.press('Control+Alt+s');await page.waitForFunction(()=>window.projectEditor.projectName==='copy.uvpaint'&&!window.projectEditor.busy);
  ok((await readFile(copy)).subarray(0,8).toString()==='UVPAINT1','Save As writes a separate project file');
  const beforeCancel=await page.locator('.project-file-name').textContent();
  await app.evaluate(({dialog})=>{dialog.showSaveDialog=async()=>({canceled:true});});
  await page.keyboard.press('Control+Alt+s');await page.waitForFunction(()=>!window.projectEditor.busy);
  ok(await page.locator('.project-file-name').textContent()===beforeCancel,'Canceling Save As keeps the current project identity');
  const bytesBefore=await readFile(copy);
  await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},path.resolve('test-results/missing-parent/fail.uvpaint'));
  await page.keyboard.press('Control+Alt+s');await page.getByRole('alert').waitFor();
  ok((await readFile(copy)).equals(bytesBefore),'Failed Save As preserves the existing project file');await page.getByTitle('Dismiss error',{exact:true}).click();
  // A separate Electron process must reopen the on-disk project with no source GLB present.
  const expected=await page.evaluate(()=>window.projectExpected);
  await app.close();app=await electron.launch({args:['.',`--user-data-dir=${process.cwd()}/test-results/project-reopen-profile`],env});
  page=await app.firstWindow();await page.waitForSelector('.empty-canvas');
  await page.evaluate(async()=>{window.projectEditor=(await import('/src/core/editor.ts')).editor;});
  await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);
  await page.getByTitle('Application menu',{exact:true}).click();await page.getByRole('menuitem',{name:'Open project',exact:true}).click();
  await page.waitForFunction(()=>window.projectEditor.projectName==='native.uvpaint'&&!window.projectEditor.busy);
  ok(await page.evaluate(async expected=>{const {editor:e}=await import('/src/core/editor.ts');return e.model.parts.length===3&&e.model.slots.length===2&&e.doc.textureUsage==='AO'&&e.layer.canvas.toDataURL()===expected.docs[1].layers.at(-1).pixels&&e.hiddenFaces.size===14;},expected),'Native Open project restores the model and edited texture after application restart');
  await app.evaluate(({dialog})=>{dialog.showSaveDialog=async()=>{throw new Error('Unexpected Save dialog');};});
  await page.getByTestId('texture-canvas').focus();await page.keyboard.press('Control+s');await page.waitForFunction(()=>!window.projectEditor.busy&&window.projectEditor.notice?.text.startsWith('Project saved:'));
  ok(await page.getByRole('alert').count()===0,'Opened project retains write access for subsequent Ctrl+S');
  await page.screenshot({path:'test-results/project-workspace.png'});
} finally {await app.close();await server.close();}
