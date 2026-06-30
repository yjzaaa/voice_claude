import { DoubaoAsrEngine } from '../../../../src/adapters/asr/DoubaoAsrEngine';
import * as doubao from '../../../../src/asr/doubao';

jest.mock('../../../../src/asr/doubao');

describe('DoubaoAsrEngine', () => {
  test('has name "doubao"', () => {
    const engine = new DoubaoAsrEngine({ appId: 'id', accessToken: 'token' });
    expect(engine.name).toBe('doubao');
  });

  test('is available when appId and accessToken are present', () => {
    const engine = new DoubaoAsrEngine({ appId: 'id', accessToken: 'token' });
    expect(engine.isAvailable()).toBe(true);
  });

  test('is unavailable when appId is missing', () => {
    const engine = new DoubaoAsrEngine({ accessToken: 'token' } as any);
    expect(engine.isAvailable()).toBe(false);
  });

  test('is unavailable when accessToken is missing', () => {
    const engine = new DoubaoAsrEngine({ appId: 'id' } as any);
    expect(engine.isAvailable()).toBe(false);
  });

  test('is unavailable when both credentials are missing', () => {
    const engine = new DoubaoAsrEngine({});
    expect(engine.isAvailable()).toBe(false);
  });

  test('transcribe delegates to doubao transcribe with audio and sample rate', async () => {
    const transcribeMock = jest.spyOn(doubao, 'transcribe').mockResolvedValue('hello');
    const engine = new DoubaoAsrEngine({ appId: 'id', accessToken: 'token' });
    const audio = Buffer.from('pcm');

    const result = await engine.transcribe(audio, 16000);

    expect(transcribeMock).toHaveBeenCalledWith(audio, 16000);
    expect(result).toBe('hello');
  });

  test('transcribe returns null when doubao returns null', async () => {
    jest.spyOn(doubao, 'transcribe').mockResolvedValue(null);
    const engine = new DoubaoAsrEngine({ appId: 'id', accessToken: 'token' });

    const result = await engine.transcribe(Buffer.from('pcm'), 16000);

    expect(result).toBeNull();
  });
});
