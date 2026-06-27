/**
 * ASR 统一导出
 * 支持多后端：Doubao (豆包) v3 为主，预留扩展接口
 */
import { transcribe as doubaoTranscribe } from './doubao';

/** ASR 后端类型 */
export type AsrBackend = 'doubao' | 'test';

/** 语音识别选项 */
export interface AsrOptions {
  backend?: AsrBackend;
  sampleRate?: number;
  language?: string;
}

/**
 * transcribe — 统一的 ASR 接口
 * @param audio PCM 16-bit 音频数据
 * @param options 识别选项
 * @returns 识别文本，失败返回 null
 */
export async function transcribe(audio: Buffer, options: AsrOptions = {}): Promise<string | null> {
  const { backend = 'doubao', sampleRate = 16000 } = options;
  switch (backend) {
    case 'doubao':
      return doubaoTranscribe(audio, sampleRate);
    case 'test':
      return testTranscribe(audio);
    default:
      return doubaoTranscribe(audio, sampleRate);
  }
}

/**
 * testTranscribe — 测试用（返回固定值或 null）
 */
export async function testTranscribe(audio: Buffer): Promise<string | null> {
  if (audio.every(b => b === 0)) return null;
  return '测试语音识别';
}
