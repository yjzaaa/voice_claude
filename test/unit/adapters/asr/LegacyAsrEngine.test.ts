import { LegacyAsrEngine } from '../../../../src/adapters/asr/LegacyAsrEngine';

describe('LegacyAsrEngine', () => {
  test('delegates to the provided transcribe function', async () => {
    const transcribe = jest.fn().mockResolvedValue('hello');
    const engine = new LegacyAsrEngine(transcribe);

    const result = await engine.transcribe(Buffer.from('pcm'), 16000);

    expect(transcribe).toHaveBeenCalledWith(Buffer.from('pcm'), { sampleRate: 16000 });
    expect(result).toBe('hello');
  });

  test('reports availability', async () => {
    const engine = new LegacyAsrEngine(jest.fn());
    expect(await engine.isAvailable()).toBe(true);
  });
});
