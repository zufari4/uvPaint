import {_electron as electron} from "playwright";
import {createServer} from "vite";
import {mkdir} from "node:fs/promises";
import assert from "node:assert/strict";
const server=await createServer();await server.listen();
const env={...process.env,UVPAINT_DEV_URL:"http://127.0.0.1:5173"};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({args:[".",`--user-data-dir=${process.cwd()}/test-results/islands-profile`],env});
const ok=(v,label)=>{assert.ok(v,label);console.log("PASS",label);};
try {
  const page=await app.firstWindow(),errors=[];
  const selectIsland=(id,add=false)=>page.evaluate(async({id,add})=>{const {editor:e}=await import('/src/core/editor.ts');e.selectIsland(id,add);},{id,add});
  const openContext=()=>page.getByTestId("texture-canvas").click({button:"right",position:{x:5,y:5}});
  page.on("pageerror",e=>errors.push(e.message));
  await page.waitForSelector(".empty-canvas");
  await page.evaluate(()=>localStorage.removeItem("uvpaint.preferences"));await page.reload();await page.waitForSelector(".empty-canvas");
  const read=()=>page.evaluate(async()=>{
    const {editor:e}=await import("/src/core/editor.ts");
    return {scale:e.textScale,mode:e.uvDisplay,hidden:e.hiddenFaces.size,selected:e.doc?.selectedIslands??[],visible:e.visibleIslands.length,
      history:e.doc?e.history.undoStack.length:0,counts:e.model?.parts.map(p=>p.geometry.index?.count??p.geometry.getAttribute("position").count)??[],
      highlight:e.model?.parts.reduce((s,p)=>s+p.children.filter(c=>c.userData.uvPaintSelection).reduce((sum,o)=>sum+(o.visible?o.geometry.index.count:0),0),0)??0};
  });
  ok((await read()).scale===1.4&&(await read()).mode==="off","New preferences start at 140% with UV display off");
  ok(await page.locator('.canvas-footer,.uv-hint,.session-note,[aria-label="Show UV overlay"],.viewport-axis').count()===0,"Removed hint panels, UV checkbox and decorative axes stay absent");
  ok(await page.locator('.header-actions [title^="Open GLB"],.header-actions [title^="Export PNG"]').count()===0,"File commands are absent from the header");
  await page.getByTitle("Application menu",{exact:true}).click();
  ok(await page.getByRole("menuitem",{name:"Export PNG",exact:true}).isDisabled(),"PNG export is disabled without a document");
  await page.keyboard.press("ArrowDown");await page.keyboard.press("Enter");
  await page.getByLabel("UV display mode").waitFor();
  ok(await page.getByLabel("UV display mode").locator("option").count()===4,"UV display modes live in Settings with keyboard menu navigation");
  for(const mode of ["quads","triangles","outline","off"]){
    await page.getByLabel("UV display mode").selectOption(mode);ok((await read()).mode===mode,`UV display mode ${mode} applies`);
  }
  await page.getByLabel("Text size",{exact:true}).fill("1.75");
  await page.getByLabel("UV display mode").selectOption("outline");
  await page.keyboard.press("Escape");await page.reload();await page.waitForSelector(".empty-canvas");
  ok((await read()).scale===1.75&&(await read()).mode==="outline","Custom font size and UV mode survive reload");
  await page.evaluate(async()=>{const {editor:e}=await import("/src/core/editor.ts");e.setTextScale(1.4);await e.sample();window.originalTextures=[...e.docs.values()].map(d=>d.layers[0].canvas.toDataURL());});
  await page.getByLabel("Layer UV island",{exact:true}).waitFor();
  const merge=page.locator('.layers-panel .section-heading').getByTitle("Merge down",{exact:true});
  ok(await merge.isDisabled(),"Merge down is visible in the header and disabled for the bottom layer");
  await page.getByTitle("New empty layer",{exact:true}).click();
  await merge.click();ok(await page.locator(".layer-row").count()===1,"Header Merge down combines the active layer with the lower layer");
  await page.keyboard.press("Control+z");ok(await page.locator(".layer-row").count()===2,"Merge down is undoable");
  const history=(await read()).history;
  await selectIsland(0);
  await page.waitForFunction(async()=>{const {editor:e}=await import("/src/core/editor.ts");return e.model.parts.some(p=>p.children.some(c=>c.userData.uvPaintSelection&&c.visible));});
  ok((await read()).highlight===6&&(await read()).history===history,"UV selection highlights only its original faces without adding pixel history");
  await selectIsland(1,true);
  await page.getByTestId("texture-canvas").click({button:"right"});
  ok((await read()).selected.length===2,"Right click on selected islands preserves multiple selection");
  await page.getByRole("menuitem",{name:"Hide other islands",exact:true}).click();
  await page.waitForFunction(async()=>{const {editor:e}=await import("/src/core/editor.ts");return e.model.parts[1].geometry.index.count===0;});
  ok((await read()).counts.join(",")==="12,0"&&(await read()).visible===2,"Isolation hides other faces across all materials and hides their UV lines");
  ok(await page.getByLabel("Layer UV island",{exact:true}).locator("option").filter({hasText:"Hidden"}).count()===4,"Hidden islands remain accessible in the layer dropdown");
  const hidden=(await read()).hidden;
  const materialIds=await page.getByLabel("Active material",{exact:true}).locator("option").evaluateAll(os=>os.map(o=>o.value));
  await page.getByLabel("Active material",{exact:true}).selectOption(materialIds[1]);
  ok((await read()).hidden===hidden&&(await read()).visible===0,"Physical face visibility survives switching materials");
  await page.getByLabel("Active material",{exact:true}).selectOption(materialIds[0]);
  await page.evaluate(async()=>{
    const {editor:e}=await import("/src/core/editor.ts");const {sourceGeometry}=await import("/src/render/mesh-source.ts");
    for(const p of e.model.parts){const g=sourceGeometry(p);g.setAttribute("uv1",g.getAttribute("uv").clone());}
    e.model.slots[0].uvSets.push("uv1");e.selectUVSet("uv1");
  });
  ok((await read()).hidden===hidden&&(await read()).visible===2,"Physical face visibility survives switching UV maps");
  await selectIsland(0);await openContext();
  await page.getByRole("menuitem",{name:"Show all except selected",exact:true}).click();
  await page.waitForFunction(async()=>{const {editor:e}=await import("/src/core/editor.ts");return e.model.parts[1].geometry.index.count===36;});
  ok((await read()).counts[0]===30&&(await read()).counts[1]===36,"Show all except selected replaces previous isolation");
  await openContext();
  await page.getByRole("menuitem",{name:"Show all islands",exact:true}).click();
  await page.waitForFunction(async()=>{const {editor:e}=await import("/src/core/editor.ts");return e.model.parts.every(p=>p.geometry.index.count===36);});
  await page.getByTitle("Brush (B)",{exact:true}).click();
  await page.getByTestId("texture-canvas").click({button:"right",position:{x:5,y:5}});
  await page.getByRole("menu",{name:"UV island actions"}).waitFor();
  await page.keyboard.press("Escape");
  ok(await page.getByRole("menu",{name:"UV island actions"}).count()===0,"2D context menu opens on blank space and Escape closes it without painting");
  await page.evaluate(async()=>{const {editor:e}=await import("/src/core/editor.ts");e.selectIsland(-1);});
  await page.getByTestId("texture-canvas").click({button:"right",position:{x:5,y:5}});
  ok(await page.getByRole("menuitem",{name:"Hide other islands",exact:true}).isDisabled(),"Selection-dependent actions disable when no island is selected");
  await page.getByTitle("Isometric view",{exact:true}).click();
  ok(await page.getByRole("menu",{name:"UV island actions"}).count()===0,"Click outside closes the island menu");
  await page.getByTestId("preview-canvas").click({button:"right"});
  ok((await read()).selected.length>0,"Right click on the 3D model selects its source UV island");
  await page.keyboard.press("Escape");
  const directions={front:[0,0,1],back:[0,0,-1],right:[1,0,0],left:[-1,0,0],top:[0,1,0],bottom:[0,-1,0]};
  const keys={front:"Numpad1",back:"Control+Numpad1",right:"Numpad3",left:"Control+Numpad3",top:"Numpad7",bottom:"Control+Numpad7"};
  for(const [view,dir] of Object.entries(directions)){
    await page.getByTestId("preview-canvas").hover();await page.keyboard.press(keys[view]);
    await page.getByTitle("Toggle perspective / orthographic",{exact:true}).click();
    await page.getByRole("button",{name:`${view[0].toUpperCase()+view.slice(1)} view`,exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.view-cube').dataset.projection==='orthographic');
    const actual=(await page.locator('.view-cube').getAttribute('data-direction')).split(',').map(Number);
    ok(actual.every((n,i)=>Math.abs(n-dir[i])<.0001),`View cube ${view} face chooses the orthographic view`);
  }
  await page.getByTitle("Isometric view",{exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.view-cube').dataset.projection==='perspective');
  const iso=(await page.locator('.view-cube').getAttribute('data-direction')).split(',').map(Number);
  ok(iso.every(n=>Math.abs(n-1/Math.sqrt(3))<.0001),"Isometric view gives all three world axes equal foreshortening");
  const preservesView=await page.evaluate(async()=>{
    const {ViewportNavigation}=await import('/src/ui/viewportNavigation.ts');
    const navigation=new ViewportNavigation(document.createElement('canvas'),()=>{});
    navigation.resize(900,600);
    navigation.orbit.target.set(2,3,4);navigation.camera.position.set(7,8,9);navigation.orbit.update();
    const target=navigation.orbit.target.clone();
    const height=()=>navigation.camera===navigation.orthographic
      ? (navigation.orthographic.top-navigation.orthographic.bottom)/navigation.orthographic.zoom
      : 2*navigation.camera.position.distanceTo(navigation.orbit.target)*Math.tan(navigation.perspective.fov*Math.PI/360);
    let valid=true;
    for(const view of ['front','back','left','right','top','bottom','isometric']){
      const before=height();navigation.setView(view);
      valid &&= navigation.orbit.target.distanceTo(target)<1e-8 && Math.abs(height()-before)<1e-8;
      if(navigation.camera===navigation.orthographic){navigation.orthographic.zoom=1.7;navigation.orthographic.updateProjectionMatrix();}
    }
    navigation.dispose();return valid;
  });
  ok(preservesView,"View changes preserve a panned orbit center and zoomed viewing scale");
  ok(await page.getByRole("menu",{name:"UV island actions"}).count()===0,"Cube controls do not open the island menu");
  const unchanged=await page.evaluate(async()=>{
    const {editor:e}=await import("/src/core/editor.ts");
    return [...e.docs.values()].every((d,i)=>d.layers[0].canvas.toDataURL()===window.originalTextures[i]);
  });
  ok(unchanged,"Selection, visibility and cube navigation never modify texture pixels");
  await page.evaluate(async()=>{const {editor:e}=await import("/src/core/editor.ts");e.selectIsland(0);e.setIslandVisibility("isolate");await e.sample();});
  ok((await read()).hidden===0,"Loading another model resets island isolation");
  await selectIsland(0);
  await mkdir("test-results",{recursive:true});await page.screenshot({path:"test-results/islands-workspace.png"});
  assert.deepEqual(errors,[]);
} finally {await app.close();await server.close();}
