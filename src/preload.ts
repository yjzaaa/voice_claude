import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('voiceAPI', {
  sendEnter: () => ipcRenderer.send('voice:enter'),
});
