/**
 * ASR 统一导出
 */
import { transcribe as doubaoTranscribe } from "./doubao";

export type AsrBackend = "doubao" | "test";

export interface AsrOptions {
  backend?: AsrBackend;
  sampleRate?: number;
  language?: string;
}

export async function transcribe(audio: Buffer, options: AsrOptions = {}): Promise<string | null> {
  const { backend = "doubao", sampleRate = 16000 } = options;
  switch (backend) {
    case "doubao":
      return doubaoTranscribe(audio, sampleRate);
    case "test":
      return testTranscribe(audio);
    default:
      return doubaoTranscribe(audio, sampleRate);
  }
}

export async function testTranscribe(audio: Buffer): Promise<string | null> {
  if (audio.every(b => b === 0)) return null;
  return "测试语音识别";
}
