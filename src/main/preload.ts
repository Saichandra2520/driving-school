import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  platform: process.platform,
  openExternalUrl: (url: string) => ipcRenderer.invoke('open-external-url', url)
});
