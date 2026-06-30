import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('voiceAPI', {
  send: (text: string) => ipcRenderer.send('voice:text', text),
});

contextBridge.exposeInMainWorld('agentAPI', {
  on: (event: string, fn: (...args: any[]) => void) =>
    ipcRenderer.on(`agent:${event}`, (_e, ...args) => fn(...args)),
  removeAllListeners: (event: string) => ipcRenderer.removeAllListeners(`agent:${event}`),
});

contextBridge.exposeInMainWorld('recorderAPI', {
  ready: () => ipcRenderer.send('recorder:ready'),
  sendPcm: (buffer: ArrayBuffer) => ipcRenderer.send('recorder:pcm', buffer),
  onStart: (fn: () => void) => ipcRenderer.on('recorder:start', fn),
  onStop: (fn: () => void) => ipcRenderer.on('recorder:stop', fn),
  removeAllListeners: () => {
    ipcRenderer.removeAllListeners('recorder:start');
    ipcRenderer.removeAllListeners('recorder:stop');
  },
});

contextBridge.exposeInMainWorld('statusAPI', {
  toggle: () => ipcRenderer.send('status:toggle'),
  onStateChange: (fn: (recording: boolean) => void) =>
    ipcRenderer.on('status:state', (_e, recording) => fn(recording)),
  removeAllListeners: () => ipcRenderer.removeAllListeners('status:state'),
});

contextBridge.exposeInMainWorld('loggerAPI', {
  log: (level: string, cmp: string, msg: string, extra?: any) =>
    ipcRenderer.send('renderer:log', level, cmp, msg, extra),
});
