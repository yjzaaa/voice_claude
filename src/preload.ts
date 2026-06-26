import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('voiceAPI', {
  send: (text: string) => ipcRenderer.send('voice:text', text),
});
