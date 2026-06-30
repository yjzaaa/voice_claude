import { AsrEngine } from '../../ports/incoming/AsrEngine';
import { start, stop, isModelAvailable } from '../../asr/vosk';

export interface VoskAsrEngineOptions {
  /** Maximum time to wait for a recognition result, in milliseconds. */
  recognitionTimeoutMs?: number;
}

export class VoskAsrEngine implements AsrEngine {
  readonly name = 'vosk';
  private readonly recognitionTimeoutMs: number;

  constructor(options: VoskAsrEngineOptions = {}) {
    this.recognitionTimeoutMs = options.recognitionTimeoutMs ?? 3000;
  }

  isAvailable(): boolean {
    return isModelAvailable();
  }

  async transcribe(_audio: Buffer, _sampleRate: number): Promise<string | null> {
    return new Promise<string | null>((resolve) => {
      let resolved = false;
      let handle: { stop: () => void } | null = null;

      const stopAndResolve = (value: string | null) => {
        if (resolved) return;
        resolved = true;
        handle?.stop();
        resolve(value);
      };

      handle = start((text: string) => {
        const trimmed = text?.trim();
        if (!trimmed) return;
        stopAndResolve(trimmed);
      });

      // If the callback fired synchronously during start(), handle may not have
      // been assigned yet; stop the returned handle now to release resources.
      if (resolved) {
        handle.stop();
      }

      const timer = setTimeout(() => stopAndResolve(null), this.recognitionTimeoutMs);

      // Ensure the timer does not keep the process alive longer than necessary.
      timer.unref?.();
    });
  }
}

/** Stop any running Vosk recognizer. Exported for cleanup in tests/process exit. */
export { stop };
