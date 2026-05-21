import { createRequire } from "node:module";
const require$1 = createRequire(import.meta.url);
const { contextBridge, ipcRenderer } = require$1("electron");
contextBridge.exposeInMainWorld("electron", {
  platform: process.platform,
  openExternalUrl: (url) => ipcRenderer.invoke("open-external-url", url)
});
