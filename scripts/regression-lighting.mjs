import { _electron as electron } from 'playwright';
import { createServer } from 'vite';
import assert from 'node:assert/strict';
const server = await createServer(); await server.listen();
const env = { ...process.env, UVPAINT_DEV_URL: 'http://127.0.0.1:5173' }; delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.', `--user-data-dir=${process.cwd()}/test-results/lighting-profile`], env });
const check = (v,label) => { assert.ok(v,label);console.log('PASS',label); };
try {
  const page=await app.firstWindow(), errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.waitForSelector('.empty-canvas');
  await page.evaluate(()=>localStorage.removeItem('uvpaint.preferences'));await page.reload();await page.waitForSelector('.empty-canvas');
  await page.evaluate(async()=>{window.e=(await import('/src/core/editor.ts')).editor;await e.sample();e.previewEdges=false;e.emit();window.originalPixels=e.output.toDataURL();window.originalHistory=e.history.undoStack.length;window.rendererCanvas=document.querySelector('[data-testid=preview-canvas]');});
  const readPreview = () => page.evaluate(async()=>{
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const source=document.querySelector('[data-testid=preview-canvas]'),c=document.createElement('canvas');c.width=source.width;c.height=source.height;
    const ctx=c.getContext('2d');ctx.drawImage(source,0,0);const pixels=ctx.getImageData(0,0,c.width,c.height).data;
    let sum=0,count=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]>200){sum+=pixels[i]+pixels[i+1]+pixels[i+2];count++;}
    return {brightness:sum/Math.max(count,1),image:c.toDataURL()};
  });
  const normal=await readPreview();
  check(await page.evaluate(()=>JSON.stringify(e.studioLighting)===JSON.stringify({exposure:.8,key:1.35,fill:.45,environment:.55})),'Default lighting matches 80%, 135%, 45%, 55%');
  await page.getByTitle('Application menu',{exact:true}).click();await page.getByRole('menuitem',{name:'Settings',exact:true}).click();
  for (const name of ['exposure','main light','fill light','environment light']) {
    const slider=page.getByLabel(`Studio ${name}`,{exact:true});await slider.focus();await slider.press('Home');
  }
  check((await readPreview()).brightness<normal.brightness*.3,'Lighting controls immediately darken the actual rendered model');
  check(await page.evaluate(async()=>{
    const {Editor}=await import('/src/core/editor.ts');const fresh=new Editor();
    return JSON.stringify(fresh.studioLighting)===JSON.stringify(e.studioLighting)&&fresh.studioLighting.key===0&&fresh.studioLighting.exposure===.1;
  }),'Lighting values persist for the next application session');
  await page.getByTitle('Reset studio lighting',{exact:true}).click();
  check(Math.abs((await readPreview()).brightness-normal.brightness)<1,'Reset restores default lighting');
  await page.getByTitle('Close settings',{exact:true}).click();
  check(await page.getByLabel('Preview shading').count()===0,'Removed shading selector is absent');
  await page.evaluate(()=>e.setStudioLighting({exposure:2,key:5,fill:3,environment:5}));
  check((await readPreview()).brightness>normal.brightness,'3D view always applies the chosen studio lighting');
  check(await page.evaluate(()=>e.output.toDataURL()===window.originalPixels&&e.history.undoStack.length===window.originalHistory&&document.querySelector('[data-testid=preview-canvas]')===window.rendererCanvas),'Lighting changes preserve export pixels, undo history and the existing renderer');
  check(await page.evaluate(async()=>{
    const {normalizeStudioLighting,defaultStudioLighting}=await import('/src/core/studio-lighting.ts');
    const result=normalizeStudioLighting({exposure:NaN,key:-10,fill:'bad',environment:900});
    return result.exposure===defaultStudioLighting.exposure&&result.key===0&&result.fill===defaultStudioLighting.fill&&result.environment===5;
  }),'Invalid saved lighting values fall back safely or clamp to supported limits');
  await page.reload();await page.waitForSelector('.empty-canvas');
  check(await page.evaluate(async()=>{const {editor}=await import('/src/core/editor.ts');return editor.studioLighting.environment===5&&editor.studioLighting.exposure===2;}),'Reload retains studio settings');
  assert.deepEqual(errors,[]);
} finally { await app.close();await server.close(); }
