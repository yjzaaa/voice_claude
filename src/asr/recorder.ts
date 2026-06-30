/**
 * Doubao ASR Recorder — 隐藏 BrowserWindow 录音器
 *
 * 用 Web Audio API 捕获麦克风 PCM，录音结束后把完整 PCM 通过 IPC 发给主进程，
 * 主进程调用豆包 ASR 识别并投递。
 */

import { BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { logger } from '../logger';

let recorderWin: BrowserWindow | null = null;
let isReady = false;
let isRecording = false;

interface RecorderCallbacks {
  onPcm: (pcm: Buffer) => void;
  onStateChange?: (recording: boolean) => void;
}

let callbacks: RecorderCallbacks | null = null;

function ensureWindow(): BrowserWindow {
  if (recorderWin && !recorderWin.isDestroyed()) return recorderWin;

  logger.info('recorder', 'creating hidden recorder window');
  recorderWin = new BrowserWindow({
    width: 1,
    height: 1,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
    },
  });

  const htmlPath = path.join(__dirname, '..', '..', 'html', 'recorder.html');
  recorderWin.loadFile(htmlPath).catch((err: Error) => {
    logger.error('recorder', 'failed to load window', { error: err.message });
  });

  recorderWin.on('closed', () => {
    logger.info('recorder', 'window closed');
    recorderWin = null;
    isReady = false;
    isRecording = false;
  });

  return recorderWin;
}

export function initRecorder(cb: RecorderCallbacks): void {
  callbacks = cb;

  ipcMain.on('recorder:ready', () => {
    isReady = true;
    logger.info('recorder', 'ready');
  });

  ipcMain.on('recorder:pcm', (_event, arrayBuffer: ArrayBuffer) => {
    logger.info('recorder', 'pcm received from renderer', { bytes: arrayBuffer?.byteLength || 0 });
    try {
      const pcm = Buffer.from(arrayBuffer);
      logger.info('recorder', 'pcm converted', { bytes: pcm.length });
      if (callbacks) callbacks.onPcm(pcm);
      setRecording(false);
    } catch (err: any) {
      logger.error('recorder', 'failed to process pcm', { error: err.message });
      setRecording(false);
    }
  });

  ipcMain.on('recorder:log', (_event, level: string, msg: string, extra?: any) => {
    if (level === 'error') logger.error('recorder-renderer', msg, extra);
    else if (level === 'warn') logger.warn('recorder-renderer', msg, extra);
    else logger.info('recorder-renderer', msg, extra);
  });

  ensureWindow();
}

function setRecording(recording: boolean): void {
  isRecording = recording;
  logger.info('recorder', 'state changed', { recording });
  if (callbacks?.onStateChange) callbacks.onStateChange(recording);
}

export function startRecording(): boolean {
  if (isRecording) {
    logger.warn('recorder', 'start ignored: already recording');
    return false;
  }
  if (!isReady) {
    logger.warn('recorder', 'start ignored: not ready');
    ensureWindow();
    return false;
  }
  isRecording = true;
  logger.info('recorder', 'sending start to renderer');
  recorderWin?.webContents.send('recorder:start');
  if (callbacks?.onStateChange) callbacks.onStateChange(true);
  return true;
}

export function stopRecording(): boolean {
  if (!isRecording) {
    logger.warn('recorder', 'stop ignored: not recording');
    return false;
  }
  logger.info('recorder', 'sending stop to renderer');
  recorderWin?.webContents.send('recorder:stop');
  return true;
}

export function toggleRecording(): boolean {
  logger.info('recorder', 'toggle requested', { currentlyRecording: isRecording });
  const result = isRecording ? stopRecording() : startRecording();
  logger.info('recorder', 'toggle result', { result, nowRecording: isRecording });
  return result;
}

export function isRecorderRecording(): boolean {
  return isRecording;
}

export function stopRecorder(): void {
  if (recorderWin && !recorderWin.isDestroyed()) {
    recorderWin.close();
  }
  recorderWin = null;
  isReady = false;
  isRecording = false;
}
