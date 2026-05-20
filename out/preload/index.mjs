import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("electron", {
  platform: process.platform,
  openExternalUrl: (url) => ipcRenderer.invoke("open-external-url", url)
});
