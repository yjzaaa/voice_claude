import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('voiceAPI', {
  send: (text: string) => {
    fetch('http://127.0.0.1:9877/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    }).catch(() => {});
  },
  onToggle: (cb: () => void) => ipcRenderer.on('toggle-listen', () => cb()),
});
