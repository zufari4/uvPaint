import { _electron as electron } from 'playwright';
import { createServer } from 'vite';
import assert from 'node:assert/strict';
const server=await createServer();await server.listen();
const env={...process.env,UVPAINT_DEV_URL:'http://127.0.0.1:5173'};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({args:['.',`--user-data-dir=${process.cwd()}/test-results/filter-profile`],env});
const state=page=>page.evaluate(async()=>{
  const {editor:e}=await import('/src/core/editor.ts');
  const [base,copy,top]=e.doc.layers;
  return {base:base.canvas.toDataURL(),top:top.canvas.toDataURL(),shared:base.canvas===copy.canvas,undo:e.history.undoStack.length,
    pixel:[...base.canvas.getContext('2d').getImageData(13,4,1,1).data]};
});
const until=async(page,test,label)=>{
  for(let i=0;i<100;i++){const s=await state(page);if(test(s))return s;await page.waitForTimeout(50);}
  throw new Error(label);
};
try {
  const page=await app.firstWindow();await page.waitForSelector('.empty-canvas');
  await page.evaluate(async()=>{
    const {editor:e}=await import('/src/core/editor.ts');
    localStorage.removeItem('uvpaint.smartPixelate');
    await e.newCanvas(64,64);
    const x=e.layer.canvas.getContext('2d');
    x.fillStyle='#f0f0f0';x.fillRect(0,0,64,64);x.fillStyle='#000';x.fillRect(12,0,1,64);
    x.fillStyle='#d03020';x.fillRect(30,30,20,20);
    e.duplicateLayer();e.addEmpty();
    const t=e.layer.canvas.getContext('2d');t.fillStyle='#2050e0';t.fillRect(3,40,13,13);e.emit(true);
  });
  const before=await state(page);
  const dialog=page.getByRole('dialog',{name:'Smart pixelate'});
  const openFilter=async()=>{
    await page.getByTitle('Application menu').click();
    await page.getByRole('menuitem',{name:'Filter'}).hover();
    await page.getByRole('menuitem',{name:'Smart pixelate…'}).click();
    await dialog.waitFor();
  };
  await openFilter();
  await page.getByRole('radio',{name:/Whole image/}).check();
  await page.getByLabel('Pixel size').fill('8');
  const preview=await until(page,s=>s.base!==before.base&&s.top!==before.top,'Whole-image preview never appeared');
  assert.deepEqual(preview.pixel.slice(0,3),[0,0,0],'thin line survives at pixel size 8');
  assert.ok(preview.shared,'duplicated layers keep sharing one pixel buffer');
  assert.equal(preview.undo,before.undo);
  console.log('PASS Whole-image preview filters every layer without history entries');
  await page.getByRole('radio',{name:/Active layer/}).check();
  await until(page,s=>s.base===before.base&&s.top!==before.top,'Active-layer scope did not restrict the preview');
  console.log('PASS Active-layer scope filters only the active layer');
  const b=await page.getByTestId('texture-canvas').boundingBox();
  await page.mouse.click(b.x+b.width/2,b.y+b.height/2);
  assert.equal(await dialog.count(),1);
  assert.equal((await state(page)).undo,before.undo);
  console.log('PASS Clicks on the texture are ignored while the filter is open');
  const title=await page.locator('.filter-modal .modal-title h2').boundingBox();
  await page.mouse.move(title.x+10,title.y+10);await page.mouse.down();
  await page.mouse.move(title.x-290,title.y+70,{steps:5});await page.mouse.up();
  const moved=await page.locator('.filter-modal').boundingBox();
  await page.keyboard.press('Escape');
  await dialog.waitFor({state:'detached'});
  const restored=await state(page);
  assert.equal(restored.base,before.base);assert.equal(restored.top,before.top);
  console.log('PASS Cancel restores the original pixels');
  await openFilter();
  assert.equal(await page.getByLabel('Pixel size').inputValue(),'8');
  assert.ok(await page.getByRole('radio',{name:/Active layer/}).isChecked());
  const reopened=await page.locator('.filter-modal').boundingBox();
  assert.ok(Math.abs(reopened.x-moved.x)<2&&Math.abs(reopened.y-moved.y)<2&&moved.x<title.x-200);
  console.log('PASS Settings and panel position persist; the panel can be dragged');
  await page.getByRole('radio',{name:/Whole image/}).check();
  await page.getByRole('button',{name:'Apply',exact:true}).click();
  await dialog.waitFor({state:'detached'});
  const applied=await state(page);
  assert.ok(applied.base!==before.base&&applied.top!==before.top);
  assert.equal(applied.undo,before.undo+1);
  await page.evaluate(async()=>{const {editor:e}=await import('/src/core/editor.ts');e.undo();});
  const undone=await state(page);
  assert.equal(undone.base,before.base);assert.equal(undone.top,before.top);
  console.log('PASS Apply adds one undoable history entry');
} finally {await app.close();await server.close();}
