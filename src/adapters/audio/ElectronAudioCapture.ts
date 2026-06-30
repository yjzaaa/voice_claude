import { AudioCapture } from '../../ports/incoming/AudioCapture';
import { Logger } from '../../ports/outgoing/Logger';

export interface ElectronAudioCaptureDeps {
  createWindow: (options: any) => BrowserWindowLike;
  ipcMain: IpcMainLike;
  htmlPath: string;
  logger?: Logger;
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

export class ElectronAudioCapture implements AudioCapture {
  private win: BrowserWindowLike | null = null;
  private isReady = false;
  private recording = false;
  private pendingStart = false;
  private stopResolve: ((buf: Buffer) => void) | null = null;
  private pcmAccumulator = Buffer.alloc(0);
  private stateCbs: ((recording: boolean) => void)[] = [];
  private pcmCbs: ((pcm: Buffer) => void)[] = [];

  constructor(private deps: ElectronAudioCaptureDeps) {
    this.setupIpc();
  }

  private setupIpc(): void {
    this.deps.ipcMain.on('recorder:ready', () => {
      this.isReady = true;
      this.log('info', 'recorder ready');
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
        this.stopResolve(this.pcmAccumulator);
        this.stopResolve = null;
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

    this.win.loadFile(this.deps.htmlPath).catch(() => {
      this.log('error', 'failed to load recorder html', { path: this.deps.htmlPath });
    });

    this.win.on('closed', () => {
      this.win = null;
      this.isReady = false;
      this.setRecording(false);
    });
  }

  private sendStart(): void {
    if (!this.win || this.win.isDestroyed()) return;
    this.win.webContents.send('recorder:start');
    this.setRecording(true);
  }

  start(): void {
    if (this.recording) return;
    this.ensureWindow();
    if (this.isReady) {
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

  onStateChange(cb: (recording: boolean) => void): void {
    this.stateCbs.push(cb);
  }

  onPcm(cb: (pcm: Buffer) => void): void {
    this.pcmCbs.push(cb);
  }

  private setRecording(recording: boolean): void {
    if (this.recording === recording) return;
    this.recording = recording;
    this.stateCbs.forEach((cb) => cb(recording));
  }
}
