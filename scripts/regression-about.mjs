import { _electron as electron } from 'playwright';
import { createServer } from 'vite';
import assert from 'node:assert/strict';
const server=await createServer();await server.listen();
const env={...process.env,UVPAINT_DEV_URL:'http://127.0.0.1:5173'};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({args:['.',`--user-data-dir=${process.cwd()}/test-results/about-profile`],env});
const check=(v,label)=>{assert.ok(v,label);console.log('PASS',label);};
try {
  const page=await app.firstWindow();await page.waitForSelector('.empty-canvas');
  await app.evaluate(({shell})=>{shell.openExternal=async url=>{globalThis.opened=url;};});
  const version=await page.evaluate(async()=>(await import('/package.json')).version);
  await page.getByTitle('Application menu',{exact:true}).click();
  await page.getByRole('menuitem',{name:'About',exact:true}).click();
  const about=page.getByRole('dialog',{name:'About uvPaint'});
  const text=await about.textContent();
  check(text.includes(`Version ${version}`)&&text.includes('zufari4')&&text.includes('github.com/zufari4/uvPaint'),'About shows the name, version, author and project link');
  await about.getByRole('button',{name:/github\.com\/zufari4\/uvPaint/}).click();
  await page.waitForFunction(()=>true);
  check(await app.evaluate(()=>globalThis.opened)==='https://github.com/zufari4/uvPaint','The project link opens in the system browser');
  await page.keyboard.press('Escape');
  check(await page.evaluate(async()=>{try{await window.desktop.openProjectPage('https://example.com');return false;}catch{return true;}}),'Only uvPaint project pages can be opened');
  await page.getByTitle('Application menu',{exact:true}).click();
  await page.getByRole('menuitem',{name:'Check for updates',exact:true}).click();
  const status=page.getByRole('dialog',{name:'Check for updates'}).getByRole('status');
  await page.waitForFunction(()=>!document.querySelector('[role=dialog] [role=status]')?.textContent?.startsWith('Checking'),null,{timeout:20000});
  const result=await status.textContent();
  check(/latest version|new version|Cannot reach GitHub|GitHub could not/.test(result),`Update check reports a result: "${result}"`);
} finally {await app.close();await server.close();}
