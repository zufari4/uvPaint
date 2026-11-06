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
    e.setTextOptions({font:'Arial',size:40,bold:false,italic:false,align:'left',outline:false,outlineWidth:3,antialias:'smooth'});
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
  assert.deepEqual(errors,[]);
} finally {await app.close();await server.close();}
