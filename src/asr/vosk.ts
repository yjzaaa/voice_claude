/**
 * Vosk ASR — Electron main process module
 *
 * Creates a hidden BrowserWindow running vosk-browser (WASM),
 * bridges recognition results via IPC to the main app.
 *
 * Model: vosk-model-small-cn-0.22 (Chinese small model)
 * Download: https://alphacephei.com/vosk/models/vosk-model-small-cn-0.22.zip
 * For vosk-browser, the model must be re-packaged as .tar.gz
 */

import { BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

const MODEL_NAME = 'vosk-model-small-cn-0.22';
const MODELS_DIR = path.join(__dirname, '..', '..', 'models');
const MODEL_TAR = path.join(MODELS_DIR, MODEL_NAME + '.tar.gz');

let voskWin: BrowserWindow | null = null;
let isStarted = false;

/**
 * Check if the Vosk model is available
 */
export function isModelAvailable(): boolean {
  try {
    return fs.existsSync(MODEL_TAR);
  } catch {
    return false;
  }
}

/**
 * Get the path where the model should be placed
 */
export function getModelInfo(): { path: string; url: string; name: string } {
  return {
    path: MODEL_TAR,
    url: `https://alphacephei.com/vosk/models/${MODEL_NAME}.zip`,
    name: MODEL_NAME,
  };
}

/**
 * Start Vosk ASR in a hidden BrowserWindow.
 *
 * @param onResult Callback invoked with recognized text
 * @returns stop handle
 */
export function start(onResult: (text: string) => void): { stop: () => void } {
  if (isStarted) {
    console.warn('[Vosk] already started');
    return { stop: () => stop() };
  }

  if (!isModelAvailable()) {
    console.warn('[Vosk] model not found at ' + MODEL_TAR);
    console.warn('[Vosk] download the model and re-package as .tar.gz (see README)');
    return { stop: () => {} };
  }

  isStarted = true;

  // Listen for IPC results from the hidden page
  const handler = (_event: Electron.IpcMainEvent, text: string) => {
    if (text && typeof text === 'string') {
      onResult(text);
    }
  };
  ipcMain.on('voice:text', handler);

  // Create hidden window loading vosk.html
  const htmlPath = path.join(__dirname, '..', '..', 'html', 'vosk.html');
  voskWin = new BrowserWindow({
    width: 1,
    height: 1,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // Allow file:// to fetch model via HTTP
    },
  });

  voskWin.loadFile(htmlPath).catch((err: Error) => {
    console.error('[Vosk] failed to load window:', err.message);
  });

  voskWin.on('closed', () => {
    voskWin = null;
  });

  return {
    stop: () => {
      ipcMain.removeListener('voice:text', handler);
      stop();
    },
  };
}

/**
 * Stop Vosk ASR and close the hidden window
 */
export function stop(): void {
  isStarted = false;
  if (voskWin) {
    voskWin.close();
    voskWin = null;
  }
}
