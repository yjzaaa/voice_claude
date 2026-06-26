import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('voiceAPI', {
  send: (text: string) => ipcRenderer.invoke('voice:text', text),
});
