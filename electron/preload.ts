import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("desktop", {
  openFile: (kind: "model" | "image") => ipcRenderer.invoke("file:open", kind),
  savePNG: (bytes: Uint8Array, name: string) =>
    ipcRenderer.invoke("file:save-png", bytes, name),
  memory: () => ipcRenderer.invoke("system:memory"),
});
