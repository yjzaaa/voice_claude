import { AsrEngine } from '../../ports/incoming/AsrEngine';
import { transcribe } from '../../asr/doubao';

export interface DoubaoAsrEngineConfig {
  appId?: string;
  accessToken?: string;
}

export class DoubaoAsrEngine implements AsrEngine {
  readonly name = 'doubao';

  constructor(private config: DoubaoAsrEngineConfig = {}) {}

  isAvailable(): boolean {
    return Boolean(this.config.appId && this.config.accessToken);
  }

  async transcribe(audio: Buffer, sampleRate: number): Promise<string | null> {
    return transcribe(audio, sampleRate);
  }
}
