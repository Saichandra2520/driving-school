import { createRequire } from 'node:module';
import type { ContextBridge, IpcRenderer } from 'electron';

const require = createRequire(import.meta.url);
const { contextBridge, ipcRenderer } = require('electron') as {
  contextBridge: ContextBridge;
  ipcRenderer: IpcRenderer;
};

contextBridge.exposeInMainWorld('electron', {
  platform: process.platform,
  openExternalUrl: (url: string) => ipcRenderer.invoke('open-external-url', url)
});
