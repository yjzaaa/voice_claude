/**
 * ASR 统一导出
 */
<<<<<<< HEAD
import { transcribe as doubaoTranscribe, setLogFile } from './doubao';

export { setLogFile };
=======
import { transcribe as doubaoTranscribe } from './doubao';
>>>>>>> cross-platform

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

/**
 * testTranscribe — 测试用（返回固定值或 null）
<<<<<<< HEAD
 * 用于验证集成是否正常工作
 */
export async function testTranscribe(audio: Buffer): Promise<string | null> {
  // 全静音 → null
  if (audio.every(b => b === 0)) return null;
  // 有数据 → 返回模拟结果
  return '测试语音识别';
}

/**
 * generateSilence — 生成测试用的静音 PCM 数据
 * @param ms 时长（毫秒）
 * @param sampleRate 采样率
 */
export function generateSilence(ms: number, sampleRate = 16000): Buffer {
  const sampleCount = Math.floor(sampleRate * ms / 1000);
  return Buffer.alloc(sampleCount * 2); // 16-bit
}

/**
 * generateTone — 生成测试用的正弦波 PCM 数据
 * @param freqHz 频率 Hz
 * @param ms 时长毫秒
 * @param sampleRate 采样率
 */
export function generateTone(freqHz = 440, ms = 2000, sampleRate = 16000): Buffer {
  const sampleCount = Math.floor(sampleRate * ms / 1000);
  const buf = Buffer.alloc(sampleCount * 2);
  for (let i = 0; i < sampleCount; i++) {
    const s = Math.sin(2 * Math.PI * freqHz * i / sampleRate) * 0.3 * 32767;
    buf.writeInt16LE(Math.round(s), i * 2);
  }
  return buf;
}
=======
 */
export async function testTranscribe(audio: Buffer): Promise<string | null> {
  if (audio.every(b => b === 0)) return null;
  return "测试语音识别";
}
>>>>>>> cross-platform
