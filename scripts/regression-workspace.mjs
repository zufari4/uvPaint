import { _electron as electron } from "playwright";
import { createServer } from "vite";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const server = await createServer();
await server.listen();
const env = { ...process.env, UVPAINT_DEV_URL: "http://127.0.0.1:5173" };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: [".", "--user-data-dir=" + process.cwd() + "/test-results/workspace-profile"], env });
const checks = [];
const ok = (value, label) => {
  assert.ok(value, label);
  checks.push(label);
  console.log("PASS", label);
};
try {
  const page = await app.firstWindow(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.waitForSelector(".empty-canvas");
  await page.getByTitle("Restore window", { exact: true }).waitFor();
  ok(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].isMaximized(),
    ),
    "Window starts maximized",
  );
  await page.getByTitle("Restore window", { exact: true }).click();
  ok(
    (await page
      .locator(
        '.header-actions [title^="Undo"],.header-actions [title^="Redo"],.header-actions [title="Import image as layer"],.header-actions [title="New texture"]',
      )
      .count()) === 0,
    "Removed header buttons stay absent",
  );
  await page.getByTitle("Application menu", { exact: true }).click();
  await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
  ok(
    (await page.getByLabel("Text size", { exact: true }).inputValue()) ===
      "1.4",
    "Text size defaults to 140%",
  );
  ok(
    (await page.getByLabel("UV opacity").isVisible()) &&
      (await page.getByLabel("UV line color").isVisible()),
    "UV appearance lives in program settings",
  );
  await page.getByTitle("New texture", { exact: true }).click();
  ok(
    await page.getByLabel("Texture width").isVisible(),
    "Canvas settings open from program settings",
  );
  await page.getByTitle("Close", { exact: true }).click();
  await page.evaluate(async () => {
    const { editor: e } = await import("/src/core/editor.ts");
    const { canvas, context } = await import("/src/core/canvas.ts");
    await e.sample();
    await e.newCanvas(64, 64);
    e.change("Selection fixture", (d) => {
      const image = canvas(64, 64);
      context(image).fillStyle = "#3060ff";
      context(image).fillRect(0, 0, 64, 64);
      d.layers[0].canvas = image;
      d.islands = [
        {
          id: 0,
          triangles: [
            [
              { x: 0, y: 0 },
              { x: 0.5, y: 0 },
              { x: 0, y: 1 },
            ],
            [
              { x: 0.5, y: 0 },
              { x: 0.5, y: 1 },
              { x: 0, y: 1 },
            ],
          ],
        },
      ];
      d.selectedIslands = [];
      d.restrict = true;
    });
  });
  await page.getByTitle("Rectangle selection (M)", { exact: true }).click();
  const mode = page.getByRole("group", { name: "Selection mode" });
  ok(
    (await mode.locator("button").count()) === 3 &&
      (await mode.locator("select").count()) === 0,
    "Selection modes use three icon buttons",
  );
  await page.getByTitle("Add to selection (Shift)", { exact: true }).click();
  ok(
    (await page
      .getByTitle("Add to selection (Shift)", { exact: true })
      .getAttribute("aria-pressed")) === "true",
    "Selection icon switches active mode",
  );
  await page.getByTitle("New selection", { exact: true }).click();
  await page.getByTitle("Fit canvas", { exact: true }).click();
  const box = await page.getByTestId("texture-canvas").boundingBox(),
    z = Math.min((box.width - 100) / 64, (box.height - 100) / 64),
    origin = {
      x: box.x + (box.width - 64 * z) / 2,
      y: box.y + (box.height - 64 * z) / 2,
    };
  await page.getByLabel("Layer opacity", { exact: true }).focus();
  await page.mouse.move(origin.x + 42 * z, origin.y + 12 * z);
  await page.mouse.down();
  await page.mouse.move(origin.x + 58 * z, origin.y + 28 * z, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.press("Delete");
  ok(
    await page.evaluate(async () => {
      const { editor: e } = await import("/src/core/editor.ts");
      const ctx = e.layer.canvas.getContext("2d");
      return (
        ctx.getImageData(50, 20, 1, 1).data[3] === 0 &&
        ctx.getImageData(10, 20, 1, 1).data[3] === 255
      );
    }),
    "Rectangle + Delete clears selected pixels even outside UV islands after input focus",
  );
  await page.keyboard.press("Control+z");
  ok(
    await page.evaluate(async () => {
      const { editor: e } = await import("/src/core/editor.ts");
      return (
        e.layer.canvas.getContext("2d").getImageData(50, 20, 1, 1).data[3] ===
        255
      );
    }),
    "Delete is undoable",
  );
  const separator = page.getByRole("separator", {
      name: "Resize canvas and layers panels",
    }),
    s = await separator.boundingBox(),
    before = await page
      .locator(".inspector")
      .evaluate((el) => el.getBoundingClientRect().width);
  await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2);
  await page.mouse.down();
  await page.mouse.move(s.x + s.width / 2 + 60, s.y + s.height / 2, {
    steps: 5,
  });
  await page.mouse.up();
  ok(
    (await page
      .locator(".inspector")
      .evaluate((el) => el.getBoundingClientRect().width)) <
      before - 40,
    "Vertical divider resizes canvas and right-side layers panel",
  );
  await page.getByTitle("Maximize window", { exact: true }).click();
  await page.getByTitle("Restore window", { exact: true }).waitFor();
  ok(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].isMaximized(),
    ),
    "Custom maximize button operates native window",
  );
  await page.getByTitle("Restore window", { exact: true }).click();
  await page.getByTitle("Maximize window", { exact: true }).waitFor();
  await page.getByTitle("Minimize window", { exact: true }).click();
  ok(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].isMinimized(),
    ),
    "Custom minimize button operates native window",
  );
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].restore(),
  );
  await page.getByTitle("Brush (B)", { exact: true }).click();
  await mkdir("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/07-workspace.png" });
  await page.getByTitle("Application menu", { exact: true }).click();
  await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
  await page.screenshot({ path: "test-results/08-settings-large.png" });
  assert.deepEqual(errors, []);
  await writeFile(
    "test-results/workspace-results.json",
    JSON.stringify({ checks, errors }, null, 2),
  );
} finally {
  await app.close();
  await server.close();
}
