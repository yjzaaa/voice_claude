export interface AsrEngine {
  readonly name: string;
  transcribe(audio: Buffer, sampleRate: number): Promise<string | null>;
  isAvailable(): boolean | Promise<boolean>;
}
