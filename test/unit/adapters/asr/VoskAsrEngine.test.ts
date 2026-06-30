import { VoskAsrEngine } from '../../../../src/adapters/asr/VoskAsrEngine';
import * as vosk from '../../../../src/asr/vosk';

jest.mock('../../../../src/asr/vosk');

describe('VoskAsrEngine', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('has name "vosk"', () => {
    const engine = new VoskAsrEngine();
    expect(engine.name).toBe('vosk');
  });

  test('is available when the model is available', () => {
    jest.spyOn(vosk, 'isModelAvailable').mockReturnValue(true);
    const engine = new VoskAsrEngine();
    expect(engine.isAvailable()).toBe(true);
  });

  test('is unavailable when the model is missing', () => {
    jest.spyOn(vosk, 'isModelAvailable').mockReturnValue(false);
    const engine = new VoskAsrEngine();
    expect(engine.isAvailable()).toBe(false);
  });

  test('transcribe starts vosk and returns the first recognized text', async () => {
    const stopMock = jest.fn();
    jest.spyOn(vosk, 'start').mockImplementation((onResult) => {
      onResult('hello world');
      return { stop: stopMock };
    });

    const engine = new VoskAsrEngine();
    const result = await engine.transcribe(Buffer.from('pcm'), 16000);

    expect(vosk.start).toHaveBeenCalledWith(expect.any(Function));
    expect(result).toBe('hello world');
    expect(stopMock).toHaveBeenCalled();
  });

  test('transcribe returns null when no result is received within timeout', async () => {
    const stopMock = jest.fn();
    jest.spyOn(vosk, 'start').mockReturnValue({ stop: stopMock });

    const engine = new VoskAsrEngine({ recognitionTimeoutMs: 10 });
    const result = await engine.transcribe(Buffer.from('pcm'), 16000);

    expect(result).toBeNull();
    expect(stopMock).toHaveBeenCalled();
  });

  test('transcribe ignores empty results and waits for non-empty text', async () => {
    const stopMock = jest.fn();
    let callback: ((text: string) => void) | undefined;
    jest.spyOn(vosk, 'start').mockImplementation((onResult) => {
      callback = onResult;
      return { stop: stopMock };
    });

    const engine = new VoskAsrEngine({ recognitionTimeoutMs: 1000 });
    const promise = engine.transcribe(Buffer.from('pcm'), 16000);

    // Simulate an empty result followed by a valid result
    callback!('');
    callback!('valid text');

    const result = await promise;

    expect(result).toBe('valid text');
    expect(stopMock).toHaveBeenCalled();
  });
});
