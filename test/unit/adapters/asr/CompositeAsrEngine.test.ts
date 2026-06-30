import { CompositeAsrEngine } from '../../../../src/adapters/asr/CompositeAsrEngine';
import { AsrEngine } from '../../../../src/ports/incoming/AsrEngine';

function makeEngine(
  name: string,
  available: boolean,
  result: string | null,
  callLog: string[],
): AsrEngine {
  return {
    name,
    isAvailable: () => available,
    transcribe: async (_audio: Buffer) => {
      callLog.push(name);
      return result;
    },
  };
}

describe('CompositeAsrEngine', () => {
  test('uses the first available engine that returns text', async () => {
    const log: string[] = [];
    const engine = new CompositeAsrEngine([
      makeEngine('offline', false, 'offline text', log),
      makeEngine('doubao', true, 'doubao text', log),
      makeEngine('vosk', true, 'vosk text', log),
    ]);

    const result = await engine.transcribe(Buffer.from([1, 2, 3]), 16000);

    expect(result).toBe('doubao text');
    expect(log).toEqual(['doubao']);
  });

  test('skips unavailable engines and tries the next', async () => {
    const log: string[] = [];
    const engine = new CompositeAsrEngine([
      makeEngine('offline', false, 'x', log),
      makeEngine('doubao', true, null, log),
      makeEngine('vosk', true, 'vosk text', log),
    ]);

    const result = await engine.transcribe(Buffer.from([1, 2, 3]), 16000);

    expect(result).toBe('vosk text');
    expect(log).toEqual(['doubao', 'vosk']);
  });

  test('returns null when no engine produces text', async () => {
    const log: string[] = [];
    const engine = new CompositeAsrEngine([
      makeEngine('doubao', true, null, log),
      makeEngine('vosk', true, null, log),
    ]);

    const result = await engine.transcribe(Buffer.from([1, 2, 3]), 16000);

    expect(result).toBeNull();
    expect(log).toEqual(['doubao', 'vosk']);
  });

  test('returns null when no engine is available', async () => {
    const engine = new CompositeAsrEngine([
      makeEngine('doubao', false, 'x', []),
      makeEngine('vosk', false, 'x', []),
    ]);

    const result = await engine.transcribe(Buffer.from([1, 2, 3]), 16000);

    expect(result).toBeNull();
  });

  test('isAvailable returns true if any engine is available', () => {
    const available = new CompositeAsrEngine([
      makeEngine('doubao', false, 'x', []),
      makeEngine('vosk', true, 'x', []),
    ]);
    expect(available.isAvailable()).toBe(true);

    const unavailable = new CompositeAsrEngine([
      makeEngine('doubao', false, 'x', []),
      makeEngine('vosk', false, 'x', []),
    ]);
    expect(unavailable.isAvailable()).toBe(false);
  });
});
