import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("desktop", {
  openFile: (kind: "model" | "image") => ipcRenderer.invoke("file:open", kind),
  savePNG: (bytes: Uint8Array, name: string) =>
    ipcRenderer.invoke("file:save-png", bytes, name),
  memory: () => ipcRenderer.invoke("system:memory"),
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
