import { _electron as electron } from 'playwright';
import { createServer } from 'vite';
import assert from 'node:assert/strict';
const server=await createServer();await server.listen();
const env={...process.env,UVPAINT_DEV_URL:'http://127.0.0.1:5173'};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({args:['.',`--user-data-dir=${process.cwd()}/test-results/text-profile`],env});
try {
  const page=await app.firstWindow();await page.waitForSelector('.empty-canvas');
  const errors=[];page.on('pageerror',err=>errors.push(err.message));
  await page.evaluate(async()=>{
    window.__e=(await import('/src/core/editor.ts')).editor;const e=window.__e;
    await e.newCanvas(200,100);e.addEmpty();e.setColor('primary','#ff0000',1);e.setColor('secondary','#0000ff',1);
    e.setTextOptions({font:'Arial',size:40,bold:false,italic:false,underline:false,spacing:0,angle:0,align:'left',outline:false,outlineWidth:3,antialias:'smooth'});
  });
  await page.keyboard.press('t');
  assert.equal(await page.evaluate(()=>window.__e.tool),'text');
  await page.getByTitle('Fit canvas',{exact:true}).click();
  const b=await page.getByTestId('texture-canvas').boundingBox();
  const zoom=Math.min((b.width-100)/200,(b.height-100)/100);
  const screen=(x,y)=>[b.x+(b.width-200*zoom)/2+x*zoom,b.y+(b.height-100*zoom)/2+y*zoom];
  // Alpha values of the active layer inside a texture rectangle.
  const pixels=(x,y,w,h)=>page.evaluate(([x,y,w,h])=>[...window.__e.layer.canvas.getContext('2d').getImageData(x,y,w,h).data],[x,y,w,h]);
  const history=()=>page.evaluate(()=>window.__e.history.undoStack.length);

  const before=await history();
  await page.mouse.click(...screen(10,10));
  await page.keyboard.type('Hi');
  assert.equal(await page.evaluate(()=>window.__e.lineEdit?.text),'Hi','typing goes into the placed text');
  const live=await pixels(10,10,60,50);
  assert.ok(live.some((v,i)=>i%4===3&&v>200),'the text is drawn while it is typed');
  await page.keyboard.press('Control+Enter');
  assert.equal(await page.locator('.text-entry').count(),0,'Ctrl+Enter closes the text entry');
  assert.equal(await page.evaluate(()=>window.__e.history.undoStack.at(-1)?.label),'Text');
  assert.equal(await history(),before+1);
  console.log('PASS Text tool places, previews and applies typed text in one undo step');

  await page.evaluate(()=>window.__e.addEmpty());
  await page.mouse.click(...screen(100,10));
  await page.keyboard.type('O');
  await page.getByLabel('Anti-aliasing',{exact:true}).selectOption('none');
  await page.getByLabel('Text', {exact:true}).focus();
  await page.keyboard.press('Control+Enter');
  const hard=await pixels(95,5,50,60);
  const alphas=hard.filter((v,i)=>i%4===3);
  assert.ok(alphas.some(v=>v===255)&&alphas.every(v=>v===0||v===255),'no anti-aliasing leaves only fully opaque or empty pixels');
  console.log('PASS Anti-aliasing None renders hard pixel edges');

  await page.evaluate(()=>window.__e.addEmpty());
  await page.getByLabel('Anti-aliasing',{exact:true}).selectOption('smooth');
  await page.getByLabel('Text outline',{exact:true}).check();
  await page.getByLabel('Font size',{exact:true}).fill('60');
  await page.mouse.click(...screen(10,10));
  await page.keyboard.type('W');
  const outlined=await pixels(5,5,80,80);
  let red=0,blue=0;
  for(let i=0;i<outlined.length;i+=4) if(outlined[i+3]>200){ if(outlined[i]>200&&outlined[i+2]<60) red++; if(outlined[i+2]>200&&outlined[i]<60) blue++; }
  assert.ok(red>20&&blue>20,`fill uses the primary color and the outline the secondary color (${red} red, ${blue} blue)`);
  const start=await page.evaluate(()=>({...window.__e.lineEdit.a}));
  await page.mouse.move(...screen(start.x+15,start.y+25));await page.mouse.down();
  await page.mouse.move(...screen(start.x+45,start.y+25),{steps:5});await page.mouse.up();
  const moved=await page.evaluate(()=>window.__e.lineEdit.a);
  assert.ok(Math.abs(moved.x-start.x-30)<0.5&&Math.abs(moved.y-start.y)<0.5,'dragging the text moves it before it is applied');
  await page.keyboard.type('A');
  assert.equal(await page.evaluate(()=>window.__e.lineEdit.text),'WA','typing continues after moving the text');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>window.__e.lineEdit),null);
  assert.ok((await pixels(0,0,200,100)).every((v,i)=>i%4!==3||v===0),'Escape discards the text');
  console.log('PASS Outline, moving and cancelling text');

  const count=await history();
  await page.mouse.click(...screen(50,50));
  await page.keyboard.press('Control+Enter');
  assert.equal(await history(),count,'empty text adds no undo step');
  await page.getByTitle('Bold',{exact:true}).click();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('uvpaint.toolOptions')).text.bold),true,'text options are remembered');
  assert.ok((await page.getByLabel('Font',{exact:true}).locator('option').count())>3,'installed fonts are offered');
  console.log('PASS Empty text is ignored and text options persist');

  const builtin=await page.evaluate(async()=>(await import('/src/tools/text.ts')).textFonts);
  await page.waitForFunction(n=>document.querySelectorAll('select[aria-label="Font"] option').length>n,builtin.length);
  const fontNames=await page.getByLabel('Font',{exact:true}).locator('option').allTextContents();
  assert.ok(fontNames.some(f=>!builtin.includes(f)),'fonts installed on the system are listed, not only the built-in set');
  await page.evaluate(()=>window.__e.setTool('brush'));
  const brushBar=(await page.locator('.options-bar').boundingBox()).height;
  await page.evaluate(()=>window.__e.setTool('text'));
  assert.ok((await page.locator('.options-bar').boundingBox()).height<=brushBar+1,'text options fit into the usual options bar height');
  console.log('PASS System fonts are offered and the options bar keeps its height');

  await page.getByTitle('Bold',{exact:true}).click();
  await page.getByLabel('Text outline',{exact:true}).uncheck();
  await page.getByLabel('Font size',{exact:true}).fill('40');
  await page.evaluate(()=>window.__e.addEmpty());
  await page.mouse.click(...screen(10,10));
  await page.keyboard.type('abcdef');
  // Opaque pixels in the rows just below the letters, where the underline goes.
  const strip=async()=>{const top=await page.evaluate(()=>Math.round(window.__e.lineEdit.a.y+24+40*0.32));return (await pixels(0,top-1,200,4)).filter((v,i)=>i%4===3&&v>200).length;};
  const plain=await strip();
  await page.getByTitle('Underline',{exact:true}).click();
  assert.ok(await strip()>plain+40,'underline draws a line under the text being edited');
  const frame=()=>page.evaluate(async()=>{const {textFrame}=await import('/src/tools/text.ts');const e=window.__e;return textFrame(e.textOptions,e.lineEdit.text,e.lineEdit.a);});
  const narrow=(await frame()).width;
  await page.getByLabel('Letter spacing',{exact:true}).fill('10');
  assert.ok(Math.abs((await frame()).width-narrow-60)<2,'letter spacing widens the text by the spacing per character');
  await page.getByLabel('Letter spacing',{exact:true}).fill('0');
  await page.getByLabel('Text rotation',{exact:true}).fill('90');
  const extent=await page.evaluate(()=>{const d=window.__e.layer.canvas.getContext('2d').getImageData(0,0,200,100).data;let x0=200,x1=0,y0=100,y1=0;
    for(let i=3;i<d.length;i+=4)if(d[i]>0){const x=(i>>2)%200,y=(i>>2)/200|0;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}return {w:x1-x0,h:y1-y0};});
  assert.ok(extent.h>extent.w*1.4,`rotation turns the text upright (${JSON.stringify(extent)})`);
  await page.getByLabel('Text rotation',{exact:true}).fill('0');
  const f=await frame();
  const ring=[f.corners[1].x+12/zoom,f.center.y],below=[f.center.x+3,f.center.y+f.width];
  await page.getByLabel('Text',{exact:true}).focus();
  await page.keyboard.down('Shift');
  await page.mouse.move(...screen(...ring));await page.mouse.down();await page.mouse.move(...screen(...below),{steps:6});await page.mouse.up();
  await page.keyboard.up('Shift');
  assert.equal(await page.evaluate(()=>window.__e.textOptions.angle),90,'dragging just outside the text rotates it; Shift snaps to 15°');
  await page.keyboard.press('Control+Enter');
  assert.equal(await page.evaluate(()=>window.__e.history.undoStack.at(-1)?.label),'Text');
  await page.evaluate(()=>window.__e.setTextOptions({angle:0,underline:false}));
  console.log('PASS Underline, letter spacing and rotation');
  assert.deepEqual(errors,[]);
} finally {await app.close();await server.close();}
