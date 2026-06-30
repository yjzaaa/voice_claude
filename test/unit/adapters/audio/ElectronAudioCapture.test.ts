import { ElectronAudioCapture } from '../../../../src/adapters/audio/ElectronAudioCapture';

describe('ElectronAudioCapture', () => {
  let sent: { channel: string; args: any[] }[];
  let ipcHandlers: Record<string, (event: any, ...args: any[]) => void>;
  let windowEvents: Record<string, (...args: any[]) => void>;
  let fakeWindow: any;
  let createWindowCalls: any[];
  let capture: ElectronAudioCapture;

  beforeEach(() => {
    sent = [];
    ipcHandlers = {};
    windowEvents = {};
    createWindowCalls = [];

    fakeWindow = {
      webContents: { send: (channel: string, ...args: any[]) => sent.push({ channel, args }) },
      loadFile: jest.fn().mockResolvedValue(undefined),
      on: (event: string, cb: (...args: any[]) => void) => { windowEvents[event] = cb; },
      isDestroyed: () => false,
      close: jest.fn(),
    };

    const createWindow = (opts: any) => {
      createWindowCalls.push(opts);
      return fakeWindow;
    };

    const ipcMain = {
      on: (channel: string, cb: (event: any, ...args: any[]) => void) => { ipcHandlers[channel] = cb; },
    };

    capture = new ElectronAudioCapture({
      createWindow,
      ipcMain,
      htmlPath: '/fake/recorder.html',
    });
  });

  test('start creates hidden window and sends recorder:start once ready', () => {
    capture.start();
    expect(createWindowCalls.length).toBe(1);
    expect(createWindowCalls[0].show).toBe(false);

    expect(sent.some((m) => m.channel === 'recorder:start')).toBe(false);
    ipcHandlers['recorder:ready']?.({}, undefined);

    expect(sent.some((m) => m.channel === 'recorder:start')).toBe(true);
    expect(capture.isRecording()).toBe(true);
  });

  test('onStateChange fires when recording starts and stops', () => {
    const states: boolean[] = [];
    capture.onStateChange((recording: boolean) => states.push(recording));

    capture.start();
    ipcHandlers['recorder:ready']?.({}, undefined);
    expect(states).toEqual([true]);

    const pcm = Buffer.from([1, 2, 3]);
    ipcHandlers['recorder:pcm']?.({}, pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength));
    expect(states).toEqual([true, false]);
  });

  test('stop resolves with accumulated PCM and fires onPcm', async () => {
    const pcmChunks: Buffer[] = [];
    capture.onPcm((chunk: Buffer) => pcmChunks.push(chunk));

    capture.start();
    ipcHandlers['recorder:ready']?.({}, undefined);

    const stopPromise = capture.stop();
    expect(sent.some((m) => m.channel === 'recorder:stop')).toBe(true);

    const pcm = Buffer.from([0xab, 0xcd]);
    ipcHandlers['recorder:pcm']?.({}, pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength));

    const result = await stopPromise;
    expect(result).toEqual(pcm);
    expect(pcmChunks).toEqual([pcm]);
  });

  test('toggle stops when recording and starts when idle', async () => {
    expect(capture.toggle()).toBe(true);
    ipcHandlers['recorder:ready']?.({}, undefined);
    expect(capture.isRecording()).toBe(true);

    // toggling again begins stop
    capture.toggle();
    expect(capture.isRecording()).toBe(false);
    expect(sent.some((m) => m.channel === 'recorder:stop')).toBe(true);

    // simulate pcm to complete stop
    const pcm = Buffer.from([1]);
    ipcHandlers['recorder:pcm']?.({}, pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength));
  });

  test('does not start twice', () => {
    capture.start();
    ipcHandlers['recorder:ready']?.({}, undefined);
    expect(createWindowCalls.length).toBe(1);

    capture.start();
    expect(createWindowCalls.length).toBe(1);
  });
});
