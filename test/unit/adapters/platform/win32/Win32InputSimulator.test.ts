import { Win32InputSimulator } from '../../../../../src/adapters/platform/win32/Win32InputSimulator';

describe('Win32InputSimulator', () => {
  let calls: { vk: number; scan: number; flags: number; extra: number }[];
  let sleeps: number[];
  let simulator: Win32InputSimulator;

  beforeEach(() => {
    calls = [];
    sleeps = [];
    const keybdEvent = (vk: number, scan: number, flags: number, extra: number) => {
      calls.push({ vk, scan, flags, extra });
    };
    const sleep = (ms: number) => sleeps.push(ms);
    simulator = new Win32InputSimulator(keybdEvent, sleep);
  });

  test('sendKeys presses and releases mapped keys in order', () => {
    simulator.sendKeys('ctrl', 'v');

    expect(calls.length).toBe(4);
    expect(calls[0]).toEqual({ vk: 0x11, scan: 0, flags: 0, extra: 0 });
    expect(calls[1]).toEqual({ vk: 0x56, scan: 0, flags: 0, extra: 0 });
    expect(calls[2]).toEqual({ vk: 0x56, scan: 0, flags: 2, extra: 0 });
    expect(calls[3]).toEqual({ vk: 0x11, scan: 0, flags: 2, extra: 0 });
  });

  test('sendKeys ignores unknown keys', () => {
    simulator.sendKeys('ctrl', 'nonexistent', 'v');

    expect(calls.length).toBe(4);
    expect(calls.map((c) => c.vk)).toEqual([0x11, 0x56, 0x56, 0x11]);
  });

  test('sendKeys is case-insensitive', () => {
    simulator.sendKeys('CTRL', 'Enter');

    expect(calls.map((c) => c.vk)).toEqual([0x11, 0x0d, 0x0d, 0x11]);
  });

  test('pasteAndEnter pastes then sends enter', () => {
    simulator.pasteAndEnter();

    expect(calls.map((c) => c.vk)).toEqual([
      0x11,
      0x56,
      0x56,
      0x11, // ctrl+v
      0x0d,
      0x0d, // enter
    ]);
  });

  test('sendKeys inserts sleeps between events', () => {
    simulator.sendKeys('v');
    expect(sleeps.length).toBeGreaterThan(0);
  });

  test('typeText sends each character as unicode keyboard input', () => {
    const inputs: { type: number; ki: { wScan: number; dwFlags: number } }[][] = [];
    const sendInput = (batch: { type: number; ki: { wScan: number; dwFlags: number } }[]) => {
      inputs.push(batch);
    };
    const sim = new Win32InputSimulator(
      () => {},
      () => {},
      sendInput,
    );

    sim.typeText('Hi');

    expect(inputs.length).toBe(2);
    expect(inputs[0]).toEqual([
      { type: 1, ki: { wScan: 72, dwFlags: 0x0004 } },
      { type: 1, ki: { wScan: 72, dwFlags: 0x0006 } },
    ]);
    expect(inputs[1]).toEqual([
      { type: 1, ki: { wScan: 105, dwFlags: 0x0004 } },
      { type: 1, ki: { wScan: 105, dwFlags: 0x0006 } },
    ]);
  });
});
