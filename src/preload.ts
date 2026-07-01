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
  onConfig: (fn: (payload: { vad: Record<string, number> }) => void) =>
    ipcRenderer.on('recorder:config', (_e, payload) => fn(payload)),
  removeAllListeners: () => {
    ipcRenderer.removeAllListeners('recorder:start');
    ipcRenderer.removeAllListeners('recorder:stop');
    ipcRenderer.removeAllListeners('recorder:config');
  },
});

contextBridge.exposeInMainWorld('statusAPI', {
  toggle: () => ipcRenderer.invoke('status:toggle'),
  onStateChange: (fn: (recording: boolean) => void) =>
    ipcRenderer.on('status:state', (_e, recording) => fn(recording)),
  onRecorderReadyStateChange: (fn: (ready: boolean) => void) =>
    ipcRenderer.on('recorder:ready-state', (_e, ready) => fn(ready)),
  removeAllListeners: () => {
    ipcRenderer.removeAllListeners('status:state');
    ipcRenderer.removeAllListeners('recorder:ready-state');
  },
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
  getSkills: () => ipcRenderer.invoke('settings:getSkills'),
  setSkillEnabled: (name: string, enabled: boolean) =>
    ipcRenderer.invoke('settings:setSkillEnabled', name, enabled),
  reloadSkills: () => ipcRenderer.invoke('settings:reloadSkills'),
});
