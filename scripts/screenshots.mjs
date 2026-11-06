// Regenerates the README screenshots: node scripts/screenshots.mjs (needs dist-electron from npm run build).
import { _electron as electron } from 'playwright';
import { createServer } from 'vite';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
const out = path.resolve('docs/screenshots');
const profile = path.resolve('test-results/screenshots-profile');
await mkdir(out, { recursive: true });
await rm(profile, { recursive: true }).catch(() => {});
const server = await createServer(); await server.listen();
const env = { ...process.env, UVPAINT_DEV_URL: 'http://127.0.0.1:5173' }; delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.', `--user-data-dir=${profile}`], env });
const shot = (page, name) => page.screenshot({ path: path.join(out, name) });
try {
  const page = await app.firstWindow(); await page.waitForSelector('.empty-canvas');
  await app.evaluate(({ BrowserWindow, screen }) => {
    // Never larger than the work area, or part of the window ends up off screen.
    const area = screen.getPrimaryDisplay().workAreaSize, w = BrowserWindow.getAllWindows()[0];
    w.unmaximize(); w.setContentSize(Math.min(1600, area.width - 40), Math.min(940, area.height - 40)); w.center();
  });
  await page.evaluate(() => localStorage.setItem('uvpaint.layersDock', 'bottom-right'));
  await page.reload(); await page.waitForSelector('.empty-canvas');
  await page.waitForTimeout(500);
  await page.evaluate(async () => {
    window.e = (await import('/src/core/editor.ts')).editor;
    const { buildShowcase } = await import('/scripts/showcase-scene.ts');
    const { prepareModel } = await import('/src/import/model.ts');
    const result = await prepareModel(buildShowcase(), 'Supply depot.glb', (w, h) => e.checkSize(w, h));
    result.model.source = { kind: 'sample' };
    e.install(result);
    e.layer.name = 'Atlas';
    const { hitIsland } = await import('/src/tools/uv.ts');
    window.island = (u, v) => hitIsland(e.doc, { x: u * e.doc.width, y: v * e.doc.height });
  });
  await page.waitForSelector('.model-title');
  // Give the 3D view more room and turn the camera to a three-quarter angle.
  const splitter = page.getByRole('separator', { name: 'Resize texture and preview panels' });
  await splitter.focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowLeft');
  const view = await page.locator('.preview-renderer').boundingBox();
  await page.mouse.move(view.x + view.width / 2, view.y + view.height / 2);
  for (const key of ['Numpad4', 'Numpad8', 'Numpad8', 'Home']) await page.keyboard.press(key);
  await page.getByTitle('Fit canvas', { exact: true }).click();
  await page.waitForTimeout(300);
  // Shift the atlas left so the docked Layers panel does not cover it.
  const canvasBox = await page.getByTestId('texture-canvas').boundingBox();
  const panelWidth = (await page.locator('.layers-sidebar').boundingBox()).width;
  let zoom = Math.min((canvasBox.width - 100) / 2048, (canvasBox.height - 100) / 2048);
  if (canvasBox.width - 2048 * zoom < panelWidth + 30) { await page.getByTitle('Zoom out', { exact: true }).click(); zoom /= 1.2; }
  const free = (canvasBox.width - 2048 * zoom) / 2, shift = Math.max(0, Math.min(free - 8 + free, panelWidth + 15 - free));
  const mid = [canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2];
  await page.mouse.move(...mid); await page.mouse.down({ button: 'middle' });
  await page.mouse.move(mid[0] - shift, mid[1], { steps: 5 }); await page.mouse.up({ button: 'middle' });
  const at = (u, v) => [canvasBox.x + free - shift + u * 2048 * zoom, canvasBox.y + (canvasBox.height - 2048 * zoom) / 2 + v * 2048 * zoom];
  await page.waitForTimeout(400);
  await shot(page, '01-workspace.png');

  // Import a decal and link it to the crate front.
  await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 640; c.height = 300;
    const x = c.getContext('2d');
    x.fillStyle = '#f2c230'; x.fillRect(0, 0, 640, 300);
    x.fillStyle = '#1d1d1d'; x.fillRect(14, 14, 612, 272); x.fillStyle = '#f2c230'; x.fillRect(26, 26, 588, 248);
    x.fillStyle = '#1d1d1d'; x.font = 'bold 76px Arial'; x.textAlign = 'center'; x.fillText('HANDLE', 320, 128); x.fillText('WITH CARE', 320, 216);
    x.beginPath(); x.moveTo(320, 236); x.lineTo(296, 268); x.lineTo(344, 268); x.closePath(); x.fill();
    const bytes = new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/png'))).arrayBuffer());
    void e.requestImageImport(bytes, 'handle-with-care.png');
  });
  await page.getByRole('dialog', { name: 'Import image' }).waitFor();
  await page.waitForTimeout(300);
  await shot(page, '02-import.png');
  await page.evaluate(async () => {
    await e.acceptImageImport(null, null, { materialId: e.activeId, islandId: island(0.14, 0.14) });
    e.adjustTransform(0.62, 0.62, -9);
    e.updateTransform(e.transform.points.map(p => ({ x: p.x + 150, y: p.y + 60 })));
  });
  await page.waitForTimeout(400);
  await shot(page, '03-linked-decal.png');
  await page.evaluate(() => { e.confirmTransform(); e.clearCanvasSelection(); e.addEmpty(); e.layer.name = 'Paint'; });

  // Paint on the drum with the brush and line tools.
  await page.evaluate(() => { e.color = '#f4efe6'; e.brushSize = 14; e.setTool('brush'); });
  await page.mouse.move(...at(0.08, 0.66)); await page.mouse.down();
  for (let i = 1; i <= 24; i++) await page.mouse.move(...at(0.08 + i * 0.006, 0.66 + Math.sin(i / 2.2) * 0.025));
  await page.mouse.up();
  await page.evaluate(() => { e.color = '#1d1d1d'; e.brushSize = 10; e.setTool('line'); });
  for (const [a, b] of [[[0.3, 0.6], [0.45, 0.6]], [[0.45, 0.6], [0.41, 0.585]], [[0.45, 0.6], [0.41, 0.615]]]) {
    await page.mouse.move(...at(...a)); await page.mouse.down(); await page.mouse.move(...at(...b), { steps: 6 }); await page.mouse.up();
  }
  await page.evaluate(() => { e.setTool('brush'); });
  await page.mouse.move(...at(0.6, 0.67));
  await page.keyboard.press('f');
  await page.mouse.move(at(0.6, 0.67)[0] + 10, at(0.6, 0.67)[1], { steps: 4 });
  await page.waitForTimeout(200);
  await shot(page, '04-paint.png');
  await page.keyboard.press('Escape');

  // Smart pixelate with live preview; the panel sits beside the atlas so both views stay visible.
  await page.evaluate(x => localStorage.setItem('uvpaint.smartPixelate', JSON.stringify({ position: { x, y: 120 } })), Math.round(at(1, 0)[0] + 16));
  await page.getByTitle('Application menu').click();
  await page.getByRole('menuitem', { name: 'Filter' }).hover();
  await page.getByRole('menuitem', { name: 'Smart pixelate…' }).click();
  await page.getByLabel('Pixel size').fill('10');
  await page.getByLabel('Color levels').fill('12');
  await page.waitForTimeout(300);
  await page.waitForFunction(() => !document.querySelector('.filter-status'));
  await page.waitForTimeout(500);
  await shot(page, '05-smart-pixelate.png');
  await page.keyboard.press('Escape');
  console.log('Screenshots written to', out);
} finally { await app.close(); await server.close(); }
