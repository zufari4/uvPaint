import { app, BrowserWindow, dialog, ipcMain, session, Menu, net, shell } from "electron";
import { readFile, writeFile, rename, unlink } from "node:fs/promises";
import { basename, dirname, join, isAbsolute, extname } from "node:path";
import { randomUUID } from "node:crypto";
import { freemem } from "node:os";
import { RecentProjects } from "./recent-projects";
import { systemFonts } from "./system-fonts";
let win: BrowserWindow;
const projectFiles = new Map<string, string>();
const projectPage = "https://github.com/zufari4/uvPaint";
// Keep settings and recent projects saved by releases named "UV Paint".
if (!app.commandLine.hasSwitch("user-data-dir")) app.setPath("userData", join(app.getPath("appData"), "UV Paint"));
// Laptops with two GPUs otherwise render large textures on the slower integrated one.
app.commandLine.appendSwitch("force_high_performance_gpu");
app.whenReady().then(async () => {
  const recentProjects = new RecentProjects(join(app.getPath("userData"), "recent-projects.json"));
  await recentProjects.load();
  // Dialogs reopen in the folder last used for the same kind of file, across restarts.
  const folderFile = join(app.getPath("userData"), "dialog-folders.json");
  let folders: Record<string, unknown> = {};
  try { folders = JSON.parse(await readFile(folderFile, "utf8")); } catch { /* first launch */ }
  const inFolder = (kind: string, name?: string) => {
    const dir = typeof folders[kind] === "string" ? folders[kind] as string : undefined;
    return dir ? (name ? join(dir, name) : dir) : name;
  };
  const rememberFolder = async (kind: string, file: string) => {
    folders[kind] = dirname(file);
    try { await writeFile(folderFile, JSON.stringify(folders)); } catch { /* keep the session value */ }
  };
  // The default Electron Edit menu routes Ctrl+Z to Chromium's text history.
  // The application has its own menu and document-level keyboard shortcuts.
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({
    width: 1560,
    height: 1000,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: "#17191d",
    title: "uvPaint",
    icon: join(__dirname, "../dist/icon.ico"),
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
      defaultPath: inFolder(kind),
      properties: ["openFile"],
      filters:
        kind === "model"
          ? [{ name: "Binary glTF", extensions: ["glb"] }]
          : kind === "project" ? [{ name: "uvPaint project", extensions: ["uvpaint"] }] : [
              {
                name: "Images",
                extensions: ["png", "jpg", "jpeg", "webp", "bmp"],
              },
            ],
    });
    if (result.canceled) return null;
    const file = result.filePaths[0];
    await rememberFolder(kind, file);
    if (kind === "model") win.webContents.send("model:reading", basename(file));
    const bytes = new Uint8Array(await readFile(file));
    const handle = kind === "project" ? randomUUID() : undefined;
    if (handle) projectFiles.set(handle, file);
    return {
      name: basename(file),
      bytes,
      ...(kind === "model" ? { sourcePath: file } : {}),
      ...(handle ? { handle } : {}),
    };
  });
  ipcMain.handle("app:latest-release", async (event) => {
    validate(event);
    let response: Response;
    try {
      response = await net.fetch("https://api.github.com/repos/zufari4/uvPaint/releases/latest", {
        headers: { Accept: "application/vnd.github+json", "User-Agent": "uvPaint" },
      });
    } catch { throw new Error("Cannot reach GitHub. Check the internet connection and try again."); }
    if (!response.ok) throw new Error(`GitHub could not report the latest release (HTTP ${response.status}).`);
    const data = await response.json() as { tag_name?: unknown; html_url?: unknown };
    const url = typeof data.html_url === "string" && data.html_url.startsWith(projectPage) ? data.html_url : `${projectPage}/releases/latest`;
    return { version: String(data.tag_name ?? "").replace(/^v/, ""), url };
  });
  ipcMain.handle("app:system-fonts", async (event) => {
    validate(event);
    return systemFonts();
  });
  ipcMain.handle("app:open-project-page", async (event, url) => {
    validate(event);
    // Only pages of this project may be opened in the system browser.
    if (typeof url !== "string" || (url !== projectPage && !url.startsWith(`${projectPage}/`)))
      throw new Error("Only uvPaint project pages can be opened.");
    await shell.openExternal(url);
  });
  ipcMain.handle("model:reload", async (event, file) => {
    validate(event);
    if (typeof file !== "string" || !isAbsolute(file) || extname(file).toLowerCase() !== ".glb")
      throw new Error("Invalid source GLB path.");
    try { return { name: basename(file), bytes: new Uint8Array(await readFile(file)), sourcePath: file }; }
    catch { throw new Error(`Cannot reload GLB: ${file}. The original file is missing or unavailable.`); }
  });
  ipcMain.handle("project:recent-list", event => {
    validate(event);
    return recentProjects.list();
  });
  ipcMain.handle("project:remember", async (event, handle) => {
    validate(event);
    const file = typeof handle === "string" ? projectFiles.get(handle) : undefined;
    if (!file) throw new Error("Unknown project file.");
    await recentProjects.remember(file);
  });
  ipcMain.handle("project:open-recent", async (event, id) => {
    validate(event);
    const file = recentProjects.path(id);
    let bytes: Uint8Array;
    try { bytes = new Uint8Array(await readFile(file)); }
    catch { throw new Error(`Cannot open project: ${file}. It may have been moved, deleted, or become unavailable. Use Open project to locate it.`); }
    const handle = randomUUID();
    projectFiles.set(handle, file);
    return { name: basename(file), bytes, handle };
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
      defaultPath: inFolder("png", safe),
      filters: [{ name: "PNG texture", extensions: ["png"] }],
    });
    if (result.canceled || !result.filePath) return null;
    await rememberFolder("png", result.filePath);
    await writeFile(result.filePath, bytes);
    return result.filePath;
  });
  ipcMain.handle("file:save-project", async (event, bytes, name, existingHandle) => {
    validate(event);
    if (!(bytes instanceof Uint8Array) || bytes.length < 16 || Buffer.from(bytes.subarray(0, 8)).toString("ascii") !== "UVPAINT1")
      throw new Error("Expected a uvPaint project.");
    if (existingHandle !== undefined && (typeof existingHandle !== "string" || !projectFiles.has(existingHandle)))
      throw new Error("Unknown project file. Use Save project as.");
    let target = existingHandle ? projectFiles.get(existingHandle)! : undefined;
    if (!target) {
      const safe = typeof name === "string" ? basename(name).replace(/[<>:\"/\\|?*]/g, "_") : "Project.uvpaint";
      const result = await dialog.showSaveDialog(win, {
        defaultPath: inFolder("project", safe.toLowerCase().endsWith(".uvpaint") ? safe : `${safe}.uvpaint`),
        filters: [{ name: "uvPaint project", extensions: ["uvpaint"] }],
      });
      if (result.canceled || !result.filePath) return null;
      target = result.filePath;
      await rememberFolder("project", target);
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
    await recentProjects.remember(target);
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
