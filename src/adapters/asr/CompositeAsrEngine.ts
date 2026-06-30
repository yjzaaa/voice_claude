import { AsrEngine } from '../../ports/incoming/AsrEngine';

export class CompositeAsrEngine implements AsrEngine {
  readonly name = 'composite';

  constructor(private engines: AsrEngine[]) {}

  isAvailable(): boolean {
    return this.engines.some((e) => {
      const v = e.isAvailable();
      return v instanceof Promise ? true : v;
    });
  }

  async transcribe(audio: Buffer, sampleRate: number): Promise<string | null> {
    for (const engine of this.engines) {
      const available = await Promise.resolve(engine.isAvailable());
      if (!available) continue;
      const text = await engine.transcribe(audio, sampleRate);
      if (text) return text;
    }
    return null;
  }
}
