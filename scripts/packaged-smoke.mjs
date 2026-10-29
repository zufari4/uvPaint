import { _electron as electron } from "playwright";
import path from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.UVPAINT_DEV_URL;
const app = await electron.launch({
  executablePath: path.resolve(process.env.UVPAINT_EXECUTABLE ?? "release/current/win-unpacked/UV Paint.exe"),
  args: [`--user-data-dir=${path.resolve("test-results/packaged-profile")}`],
  env,
});
const errors = [];
await mkdir("test-results", { recursive: true });
try {
  const page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.waitForSelector(".empty-canvas");
  assert.ok(page.url().startsWith("file://"));
  await page
    .getByRole("button", {
      name: "Explore the sample project →",
      exact: true,
    })
    .click();
  await page.waitForSelector(".model-title");
  await page.waitForTimeout(500);
  assert.equal(await page.locator(".layer-row").count(), 1);
  assert.equal(await page.getByLabel("Layer UV island", { exact: true }).count(), 0);
  assert.equal(await page.locator('.layer-footer').getByTitle('Pick UV island from canvas or model',{exact:true}).isEnabled(),true);
  assert.equal(await page.locator(".uv-panel").count(), 0);
  assert.equal(await page.locator(".error-toast").count(), 0);
  const output = path.resolve("test-results/packaged-export.png");
  await app.evaluate(({ dialog }, target) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
  }, output);
  await page.getByTitle("Application menu", {exact:true}).click();
  await page
    .getByRole("menuitem", { name: "Export PNG", exact: true })
    .click();
  await page.waitForFunction(() =>
    document.querySelector(".notice-toast")?.textContent?.includes("Exported"),
  );
  const png = await readFile(output);
  assert.equal(png.readUInt32BE(0), 0x89504e47);
  assert.equal(png.readUInt32BE(16), 1024);
  assert.equal(png.readUInt32BE(20), 1024);
  assert.equal(await app.evaluate(({ Menu }) => Menu.getApplicationMenu() === null), true);
  await app.evaluate(({ dialog }, target) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [target] });
  }, output);
  await page.getByTitle("Import image layer", { exact: true }).click();
  await page.getByRole("dialog", { name: "Import image", exact: true }).waitFor();
  assert.equal(await page.getByLabel("Import target layer", { exact: true }).inputValue(), "");
  assert.equal(await page.getByRole("toolbar", { name: "Import selection tools" }).locator("button[aria-pressed]").count(), 4);
  await page.getByRole('button',{name:'Next',exact:true}).click();
  await page.getByTestId('import-island-preview').waitFor();
  assert.equal(await page.getByRole('button',{name:'Import linked image',exact:true}).isDisabled(), true);
  await page.keyboard.press("Escape");
  await page.getByRole("dialog", { name: "Import image", exact: true }).waitFor({ state: "hidden" });
  const project = path.resolve('test-results/packaged-project.uvpaint');
  await app.evaluate(({ dialog }, file) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: file }); }, project);
  await page.getByTitle('New empty layer', { exact: true }).click();
  await page.getByTestId('texture-canvas').focus(); await page.keyboard.press('Control+s');
  await page.waitForFunction(() => document.querySelector('.notice-toast')?.textContent?.includes('Project saved:'));
  assert.equal((await readFile(project)).subarray(0, 8).toString(), 'UVPAINT1');
  await page.getByTitle('New empty layer', { exact: true }).click();
  assert.equal(await page.locator('.layer-row').count(), 3);
  await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, project);
  await page.getByTestId('texture-canvas').focus(); await page.keyboard.press('Control+Shift+o');
  await page.waitForFunction(() => document.querySelector('.notice-toast')?.textContent?.includes('Project opened:'));
  assert.equal(await page.locator('.layer-row').count(), 2);
  assert.equal(await page.locator('.project-file-name').textContent(), 'packaged-project.uvpaint');
  await page.screenshot({
    path: "test-results/04-packaged.png",
  });
  assert.equal(errors.length, 0);
  await writeFile(
    "test-results/packaged-results.json",
    JSON.stringify(
      {
        passed: true,
        checks: [
          "Launches packaged file:// UI without development server",
          "Sample model + six UV islands",
          "Layer panel renders",
          "No application errors",
          "Native export PNG signature and dimensions",
          "Native image selection opens the four-tool import dialog",
          "No native Edit menu intercepts document shortcuts",
          "Native project save and open restore model and layer stack offline",
        ],
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS Packaged Windows app: offline startup, sample model, PNG export, image import dialog, document shortcuts, no errors",
  );
} finally {
  await app.close();
}
