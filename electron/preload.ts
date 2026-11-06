import { contextBridge, ipcRenderer, webUtils } from "electron";
contextBridge.exposeInMainWorld("desktop", {
  openFile: (kind: "model" | "image" | "project") => ipcRenderer.invoke("file:open", kind),
  reloadModel: (path: string) => ipcRenderer.invoke("model:reload", path),
  modelFilePath: (file: File) => webUtils.getPathForFile(file),
  onModelFileReading: (callback: (name: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, name: string) => callback(name);
    ipcRenderer.on("model:reading", listener);
    return () => ipcRenderer.removeListener("model:reading", listener);
  },
  recentProjects: () => ipcRenderer.invoke("project:recent-list"),
  rememberProject: (handle: string) => ipcRenderer.invoke("project:remember", handle),
  openRecentProject: (id: string) => ipcRenderer.invoke("project:open-recent", id),
  savePNG: (bytes: Uint8Array, name: string) =>
    ipcRenderer.invoke("file:save-png", bytes, name),
  saveProject: (bytes: Uint8Array, name: string, handle?: string) =>
    ipcRenderer.invoke("file:save-project", bytes, name, handle),
  memory: () => ipcRenderer.invoke("system:memory"),
  latestRelease: () => ipcRenderer.invoke("app:latest-release"),
  systemFonts: () => ipcRenderer.invoke("app:system-fonts"),
  openProjectPage: (url: string) => ipcRenderer.invoke("app:open-project-page", url),
  windowState: () => ipcRenderer.invoke("window:state"),
  windowAction: (action: "minimize" | "maximize" | "close") =>
    ipcRenderer.invoke("window:action", action),
  onWindowState: (callback: (state: { maximized: boolean }) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      state: { maximized: boolean },
    ) => callback(state);
    ipcRenderer.on("window:state-changed", listener);
    return () => ipcRenderer.removeListener("window:state-changed", listener);
  },
});
