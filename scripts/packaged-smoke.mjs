import { _electron as electron } from "playwright";
import path from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.UVPAINT_DEV_URL;
const app = await electron.launch({
  executablePath: path.resolve("release/win-unpacked/UV Paint.exe"),
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
    .getByRole("button", { name: "Explore the sample project →", exact: true })
    .click();
  await page.waitForSelector(".model-title");
  await page.waitForTimeout(500);
  assert.equal(await page.locator(".layer-row").count(), 1);
  assert.equal(await page.locator(".island-list button").count(), 6);
  assert.equal(await page.locator(".error-toast").count(), 0);
  const output = path.resolve("test-results/packaged-export.png");
  await app.evaluate(({ dialog }, target) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
  }, output);
  await page
    .getByRole("button", { name: "Export PNG (Ctrl+Shift+S)", exact: true })
    .click();
  await page.waitForFunction(() =>
    document.querySelector(".status-bar")?.textContent?.includes("Exported"),
  );
  const png = await readFile(output);
  assert.equal(png.readUInt32BE(0), 0x89504e47);
  assert.equal(png.readUInt32BE(16), 1024);
  assert.equal(png.readUInt32BE(20), 1024);
  await page.screenshot({ path: "test-results/04-packaged.png" });
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
          "Native export PNG signature and 1024x1024 dimensions",
        ],
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS Packaged Windows app: offline startup, sample model, six UV islands, PNG export, no errors",
  );
} finally {
  await app.close();
}
