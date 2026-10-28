import { app, BrowserWindow, dialog, ipcMain, session, Menu } from "electron";
import { readFile, writeFile, rename, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { freemem } from "node:os";
let win: BrowserWindow;
const projectFiles = new Map<string, string>();
app.whenReady().then(() => {
  // The default Electron Edit menu routes Ctrl+Z to Chromium's text history.
  // The application has its own menu and document-level keyboard shortcuts.
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({
    width: 1560,
    height: 1000,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: "#17191d",
    title: "UV Paint",
    frame: false,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  session.defaultSession.setPermissionRequestHandler((_w, _p, callback) =>
    callback(false),
  );
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  const validate = (event: Electron.IpcMainInvokeEvent) => {
    if (
      event.sender !== win.webContents ||
      event.senderFrame !== win.webContents.mainFrame
    )
      throw new Error("Untrusted IPC sender");
  };
  ipcMain.handle("file:open", async (event, kind) => {
    validate(event);
    if (kind !== "model" && kind !== "image" && kind !== "project")
      throw new Error("Invalid file type");
    const result = await dialog.showOpenDialog(win, {
      properties: ["openFile"],
      filters:
        kind === "model"
          ? [{ name: "Binary glTF", extensions: ["glb"] }]
          : kind === "project" ? [{ name: "UV Paint project", extensions: ["uvpaint"] }] : [
              {
                name: "Images",
                extensions: ["png", "jpg", "jpeg", "webp", "bmp"],
              },
            ],
    });
    if (result.canceled) return null;
    const file = result.filePaths[0];
    const bytes = new Uint8Array(await readFile(file));
    const handle = kind === "project" ? randomUUID() : undefined;
    if (handle) projectFiles.set(handle, file);
    return {
      name: basename(file),
      bytes,
      ...(handle ? { handle } : {}),
    };
  });
  ipcMain.handle("file:save-png", async (event, bytes, name) => {
    validate(event);
    if (
      !(bytes instanceof Uint8Array) ||
      bytes.length < 8 ||
      bytes[0] !== 137 ||
      bytes[1] !== 80 ||
      bytes[2] !== 78 ||
      bytes[3] !== 71
    )
      throw new Error("Expected PNG bytes");
    const safe =
      typeof name === "string"
        ? basename(name).replace(/[<>:"/\\|?*]/g, "_")
        : "texture.png";
    const result = await dialog.showSaveDialog(win, {
      defaultPath: safe,
      filters: [{ name: "PNG texture", extensions: ["png"] }],
    });
    if (result.canceled || !result.filePath) return null;
    await writeFile(result.filePath, bytes);
    return result.filePath;
  });
  ipcMain.handle("file:save-project", async (event, bytes, name, existingHandle) => {
    validate(event);
    if (!(bytes instanceof Uint8Array) || bytes.length < 16 || Buffer.from(bytes.subarray(0, 8)).toString("ascii") !== "UVPAINT1")
      throw new Error("Expected a UV Paint project.");
    if (existingHandle !== undefined && (typeof existingHandle !== "string" || !projectFiles.has(existingHandle)))
      throw new Error("Unknown project file. Use Save project as.");
    let target = existingHandle ? projectFiles.get(existingHandle)! : undefined;
    if (!target) {
      const safe = typeof name === "string" ? basename(name).replace(/[<>:\"/\\|?*]/g, "_") : "Project.uvpaint";
      const result = await dialog.showSaveDialog(win, {
        defaultPath: safe.toLowerCase().endsWith(".uvpaint") ? safe : `${safe}.uvpaint`,
        filters: [{ name: "UV Paint project", extensions: ["uvpaint"] }],
      });
      if (result.canceled || !result.filePath) return null;
      target = result.filePath;
    }
    // Replace only after a complete write; a failed save preserves the previous project.
    const temporary = join(dirname(target), `.${basename(target)}.${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, bytes, { flag: "wx" });
      await rename(temporary, target);
    } catch (error) {
      await unlink(temporary).catch(() => {});
      throw error;
    }
    const handle = existingHandle ?? randomUUID();
    projectFiles.set(handle, target);
    return { name: basename(target), handle };
  });
  ipcMain.handle("system:memory", (event) => {
    validate(event);
    return freemem();
  });
  ipcMain.handle("window:state", (event) => {
    validate(event);
    return { maximized: win.isMaximized() };
  });
  ipcMain.handle("window:action", (event, action) => {
    validate(event);
    if (action === "minimize") win.minimize();
    else if (action === "maximize") {
      if (win.isMaximized()) win.unmaximize();
      else win.maximize();
    } else if (action === "close") win.close();
    else throw new Error("Invalid window action");
  });
  const publishWindowState = () =>
    win.webContents.send("window:state-changed", {
      maximized: win.isMaximized(),
    });
  win.on("maximize", publishWindowState);
  win.on("unmaximize", publishWindowState);
  win.once("ready-to-show", () => {
    win.maximize();
    win.show();
  });
  if (process.env.UVPAINT_DEV_URL) win.loadURL(process.env.UVPAINT_DEV_URL);
  else win.loadFile(join(__dirname, "../dist/index.html"));
});
app.on("window-all-closed", () => app.quit());
