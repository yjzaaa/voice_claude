/**
 * Doubao ASR Recorder — 隐藏 BrowserWindow 录音器
 *
 * 用 Web Audio API 捕获麦克风 PCM，录音结束后把完整 PCM 通过 IPC 发给主进程，
 * 主进程调用 ASR 识别并投递。
 */

import { BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { logger } from '../logger';
import { AsrVadConfig } from '../ports/incoming/ConfigSource';

let recorderWin: BrowserWindow | null = null;
let isReady = false;
let isRecording = false;
let onReadyStateChange: ((ready: boolean) => void) | null = null;

interface RecorderCallbacks {
  onPcm: (pcm: Buffer) => void;
  onStateChange?: (recording: boolean) => void;
}

interface RecorderOptions {
  vad?: AsrVadConfig;
  maxLoadRetries?: number;
  retryDelayMs?: number;
  onReadyStateChange?: (ready: boolean) => void;
}

let callbacks: RecorderCallbacks | null = null;
let pendingVadConfig: AsrVadConfig | null = null;

const DEFAULT_VAD: AsrVadConfig = {
  silenceThreshold: 500,
  minSpeechDurationMs: 400,
  maxSpeechDurationMs: 30000,
};

function getVadConfig(options?: RecorderOptions): AsrVadConfig {
  return options?.vad ?? DEFAULT_VAD;
}

function setReady(ready: boolean): void {
  if (isReady === ready) return;
  isReady = ready;
  logger.info('recorder', 'ready state changed', { ready });
  onReadyStateChange?.(ready);
}

function createWindow(): BrowserWindow {
  logger.info('recorder', 'creating hidden recorder window');
  const w = new BrowserWindow({
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

  w.on('closed', () => {
    logger.info('recorder', 'window closed');
    recorderWin = null;
    setReady(false);
    isRecording = false;
  });

  return w;
}

async function loadWindow(
  w: BrowserWindow,
  attempt: number,
  maxRetries: number,
  retryDelayMs: number,
): Promise<void> {
  const htmlPath = path.join(__dirname, '..', '..', 'html', 'recorder.html');
  try {
    await w.loadFile(htmlPath);
    logger.info('recorder', 'window loaded', { attempt });
  } catch (err: any) {
    logger.error('recorder', 'failed to load window', { attempt, error: err.message });
    if (attempt < maxRetries) {
      logger.info('recorder', 'retrying window load', { attempt, nextDelayMs: retryDelayMs });
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      return loadWindow(w, attempt + 1, maxRetries, retryDelayMs);
    }
    logger.error('recorder', 'window load exceeded max retries', { maxRetries });
    throw err;
  }
}

async function ensureWindow(options?: RecorderOptions): Promise<BrowserWindow | null> {
  if (recorderWin && !recorderWin.isDestroyed()) return recorderWin;

  recorderWin = createWindow();
  const maxRetries = options?.maxLoadRetries ?? 3;
  const retryDelayMs = options?.retryDelayMs ?? 1000;

  try {
    await loadWindow(recorderWin, 1, maxRetries, retryDelayMs);
  } catch {
    // 重试耗尽后关闭窗口；下次调用会重新尝试
    if (recorderWin && !recorderWin.isDestroyed()) {
      recorderWin.close();
    }
    recorderWin = null;
  }

  return recorderWin;
}

function sendVadConfigIfReady(): void {
  if (!recorderWin || recorderWin.isDestroyed() || !pendingVadConfig) return;
  recorderWin.webContents.send('recorder:config', { vad: pendingVadConfig });
  logger.info('recorder', 'sent vad config', pendingVadConfig);
}

export function initRecorder(cb: RecorderCallbacks, options?: RecorderOptions): void {
  callbacks = cb;
  onReadyStateChange = options?.onReadyStateChange ?? null;
  pendingVadConfig = getVadConfig(options);

  ipcMain.on('recorder:ready', () => {
    setReady(true);
    sendVadConfigIfReady();
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

  // 异步初始化窗口，失败会自动重试
  ensureWindow(options).then((win) => {
    if (win) {
      sendVadConfigIfReady();
    } else {
      logger.error('recorder', 'initial window load failed after retries');
    }
  });
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
    // 窗口未就绪时尝试重新创建窗口（带重试）
    ensureWindow().then((win) => {
      if (win) sendVadConfigIfReady();
    });
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

export function isRecorderReady(): boolean {
  return isReady;
}

export function stopRecorder(): void {
  if (recorderWin && !recorderWin.isDestroyed()) {
    recorderWin.close();
  }
  recorderWin = null;
  setReady(false);
  isRecording = false;
}
