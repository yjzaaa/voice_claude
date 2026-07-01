export interface AudioCapture {
  start(): void;
  stop(): Promise<Buffer>;
  toggle(): boolean;
  isRecording(): boolean;
  isReady(): boolean;
  onStateChange(cb: (recording: boolean) => void): void;
  onPcm(cb: (pcm: Buffer) => void): void;
  onReadyStateChange(cb: (ready: boolean) => void): void;
}
