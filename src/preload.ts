import { contextBridge, ipcRenderer } from 'electron';
import type {
  PermissionRequestPayload,
  PermissionDecision,
} from './infrastructure/ipc/PermissionIpc';

/** 权限请求/响应通道名（在 preload 中内联，避免沙箱内相对路径 require 失败）。 */
const PERMISSION_CHANNELS = {
  REQUEST: 'agent:permission-request',
  RESPONSE: 'agent:permission-response',
} as const;

contextBridge.exposeInMainWorld('voiceAPI', {
  send: (text: string) => ipcRenderer.send('voice:text', text),
});

contextBridge.exposeInMainWorld('agentAPI', {
  on: (event: string, fn: (...args: any[]) => void) =>
    ipcRenderer.on(`agent:${event}`, (_e, ...args) => fn(...args)),
  removeAllListeners: (event: string) => ipcRenderer.removeAllListeners(`agent:${event}`),
});

const pendingPermissionRequests = new Map<string, { tools: string[] }>();

function toPermissionDecision(allow: boolean, remember: boolean): PermissionDecision {
  if (!allow) return 'deny';
  if (remember) return 'allow-always';
  return 'allow-once';
}

contextBridge.exposeInMainWorld('permissionAPI', {
  onPermissionRequest: (fn: (payload: PermissionRequestPayload & { requestId: string }) => void) =>
    ipcRenderer.on(PERMISSION_CHANNELS.REQUEST, (_e, payload) => {
      pendingPermissionRequests.set(payload.requestId, { tools: payload.tools });
      fn(payload);
    }),
  respondPermission: (payload: { allow: boolean; remember: boolean; requestId: string }) => {
    const pending = pendingPermissionRequests.get(payload.requestId);
    const tools = pending?.tools ?? [];
    pendingPermissionRequests.delete(payload.requestId);
    ipcRenderer.send(PERMISSION_CHANNELS.RESPONSE, {
      requestId: payload.requestId,
      tools,
      decision: toPermissionDecision(payload.allow, payload.remember),
    });
  },
  removeAllListeners: () => {
    ipcRenderer.removeAllListeners(PERMISSION_CHANNELS.REQUEST);
    pendingPermissionRequests.clear();
  },
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

contextBridge.exposeInMainWorld('settingsAPI', {
  getPreferences: () => ipcRenderer.invoke('settings:getPreferences'),
  setPreferences: (prefs: Record<string, unknown>) =>
    ipcRenderer.invoke('settings:setPreferences', prefs),
  getRiskWhitelist: () => ipcRenderer.invoke('settings:getRiskWhitelist'),
  addRiskWhitelist: (tool: string) => ipcRenderer.invoke('settings:addRiskWhitelist', tool),
  removeRiskWhitelist: (tool: string) => ipcRenderer.invoke('settings:removeRiskWhitelist', tool),
  getRecentActions: () => ipcRenderer.invoke('settings:getRecentActions'),
});
