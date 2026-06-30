import { AsrEngine } from '../../ports/incoming/AsrEngine';
import { AsrOptions } from '../../asr';

/**
 * 兼容旧 ASR 模块的桥接适配器。
 * 在正式提取 DoubaoAsrEngine / VoskAsrEngine 之前，先用它把现有 `transcribe` 函数包装成 AsrEngine port。
 */
export class LegacyAsrEngine implements AsrEngine {
  readonly name = 'legacy';

  /**
   * @param transcribeFn - 旧 ASR 模块的 transcribe 函数
   */
  constructor(
    private transcribeFn: (audio: Buffer, options: AsrOptions) => Promise<string | null>,
  ) {}

  async transcribe(audio: Buffer, sampleRate: number): Promise<string | null> {
    return this.transcribeFn(audio, { sampleRate });
  }

  isAvailable(): boolean {
    return true;
  }
}
