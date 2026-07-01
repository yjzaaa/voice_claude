import { AudioCapture } from '../../ports/incoming/AudioCapture';
import { AsrVadConfig } from '../../ports/incoming/ConfigSource';
import { Logger } from '../../ports/outgoing/Logger';

export interface ElectronAudioCaptureDeps {
  createWindow: (options: any) => BrowserWindowLike;
  ipcMain: IpcMainLike;
  htmlPath: string;
  logger?: Logger;
  /** VAD 参数；不提供时使用默认值。 */
  vad?: AsrVadConfig;
  /** 录音窗口加载失败时的最大重试次数。 */
  maxLoadRetries?: number;
  /** 重试间隔毫秒数。 */
  retryDelayMs?: number;
}

interface BrowserWindowLike {
  webContents: { send(channel: string, ...args: any[]): void };
  loadFile(path: string): Promise<void>;
  on(event: string, callback: (...args: any[]) => void): void;
  isDestroyed(): boolean;
  close(): void;
}

interface IpcMainLike {
  on(channel: string, callback: (event: any, ...args: any[]) => void): void;
}

const DEFAULT_VAD: AsrVadConfig = {
  silenceThreshold: 500,
  minSpeechDurationMs: 400,
  maxSpeechDurationMs: 30000,
};

/** 基于 Electron 隐藏窗口的音频捕获适配器。 */
export class ElectronAudioCapture implements AudioCapture {
  private win: BrowserWindowLike | null = null;
  private ready = false;
  private recording = false;
  private pendingStart = false;
  private stopResolve: ((buf: Buffer) => void) | null = null;
  private pcmAccumulator = Buffer.alloc(0);
  private stateCbs: ((recording: boolean) => void)[] = [];
  private pcmCbs: ((pcm: Buffer) => void)[] = [];
  private readyCbs: ((ready: boolean) => void)[] = [];
  private loadAttempt = 0;

  constructor(private deps: ElectronAudioCaptureDeps) {
    this.setupIpc();
  }

  private getVadConfig(): AsrVadConfig {
    return (
      this.deps.vad ?? {
        silenceThreshold: DEFAULT_VAD.silenceThreshold,
        minSpeechDurationMs: DEFAULT_VAD.minSpeechDurationMs,
        maxSpeechDurationMs: DEFAULT_VAD.maxSpeechDurationMs,
      }
    );
  }

  private setupIpc(): void {
    this.deps.ipcMain.on('recorder:ready', () => {
      this.setReady(true);
      this.log('info', 'recorder ready');
      this.sendVadConfig();
      if (this.pendingStart) {
        this.pendingStart = false;
        this.sendStart();
      }
    });

    this.deps.ipcMain.on('recorder:pcm', (_event, arrayBuffer: ArrayBuffer) => {
      const pcm = Buffer.from(arrayBuffer);
      this.pcmAccumulator = Buffer.concat([this.pcmAccumulator, pcm]);
      this.pcmCbs.forEach((cb) => cb(pcm));
      this.setRecording(false);
      if (this.stopResolve) {
        const accumulated = this.pcmAccumulator;
        this.stopResolve(accumulated);
        this.stopResolve = null;
        this.clearAccumulator();
      }
    });

    this.deps.ipcMain.on('recorder:log', (_event, level: string, msg: string, extra?: any) => {
      this.log(level as 'info' | 'warn' | 'error', msg, extra);
    });
  }

  private log(level: 'info' | 'warn' | 'error', msg: string, extra?: any): void {
    if (!this.deps.logger) return;
    if (level === 'error') this.deps.logger.error('recorder', msg, extra);
    else if (level === 'warn') this.deps.logger.warn('recorder', msg, extra);
    else this.deps.logger.info('recorder', msg, extra);
  }

  private async loadWindowWithRetry(): Promise<void> {
    if (!this.win) return;
    const maxRetries = this.deps.maxLoadRetries ?? 3;
    const retryDelayMs = this.deps.retryDelayMs ?? 1000;

    while (this.loadAttempt < maxRetries) {
      this.loadAttempt += 1;
      try {
        await this.win.loadFile(this.deps.htmlPath);
        this.loadAttempt = 0;
        this.log('info', 'recorder window loaded');
        return;
      } catch (err: any) {
        this.log('error', 'failed to load recorder html', {
          attempt: this.loadAttempt,
          error: err.message,
        });
        if (this.loadAttempt < maxRetries) {
          this.log('info', 'retrying recorder window load', {
            nextDelayMs: retryDelayMs,
          });
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        }
      }
    }

    this.log('error', 'recorder window load exceeded max retries', { maxRetries });
    this.win.close();
    this.win = null;
  }

  private ensureWindow(): void {
    if (this.win && !this.win.isDestroyed()) return;

    this.win = this.deps.createWindow({
      width: 1,
      height: 1,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: false,
      },
    });

    this.loadWindowWithRetry();

    this.win.on('closed', () => {
      this.win = null;
      this.setReady(false);
      this.setRecording(false);
    });
  }

  private sendVadConfig(): void {
    if (!this.win || this.win.isDestroyed()) return;
    const vad = this.getVadConfig();
    this.win.webContents.send('recorder:config', { vad });
    this.log('info', 'sent vad config', vad);
  }

  private sendStart(): void {
    if (!this.win || this.win.isDestroyed()) return;
    this.clearAccumulator();
    this.win.webContents.send('recorder:start');
    this.setRecording(true);
  }

  private clearAccumulator(): void {
    this.pcmAccumulator = Buffer.alloc(0);
  }

  setVad(vad: AsrVadConfig): void {
    this.deps.vad = vad;
    this.sendVadConfig();
  }

  start(): void {
    if (this.recording) return;
    this.ensureWindow();
    if (this.ready) {
      this.sendStart();
    } else {
      this.pendingStart = true;
    }
  }

  stop(): Promise<Buffer> {
    if (!this.recording) {
      return Promise.resolve(this.pcmAccumulator);
    }
    this.setRecording(false);
    this.win?.webContents.send('recorder:stop');
    return new Promise((resolve) => {
      this.stopResolve = resolve;
    });
  }

  toggle(): boolean {
    if (this.recording) {
      this.stop();
      return false;
    }
    this.start();
    return true;
  }

  isRecording(): boolean {
    return this.recording;
  }

  isReady(): boolean {
    return this.ready;
  }

  onStateChange(cb: (recording: boolean) => void): void {
    this.stateCbs.push(cb);
  }

  onPcm(cb: (pcm: Buffer) => void): void {
    this.pcmCbs.push(cb);
  }

  onReadyStateChange(cb: (ready: boolean) => void): void {
    this.readyCbs.push(cb);
  }

  private setReady(ready: boolean): void {
    if (this.ready === ready) return;
    this.ready = ready;
    this.readyCbs.forEach((cb) => cb(ready));
  }

  private setRecording(recording: boolean): void {
    if (this.recording === recording) return;
    this.recording = recording;
    this.stateCbs.forEach((cb) => cb(recording));
  }
}
