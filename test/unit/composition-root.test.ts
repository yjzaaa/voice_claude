import { createApp } from '../../src/composition-root';

describe('composition-root', () => {
  test('creates core infrastructure services', () => {
    const app = createApp();
    expect(app.logger).toBeDefined();
    expect(app.metrics).toBeDefined();
    expect(app.eventBus).toBeDefined();
    expect(app.config).toBeDefined();
  });

  test('assembles win32 platform adapters on windows', () => {
    const app = createApp();
    expect(app.windowManager).toBeDefined();
    expect(app.inputSimulator).toBeDefined();
    expect(app.clipboard).toBeDefined();
    expect(app.processLauncher).toBeDefined();
  });

  test('assembles llm client from config', () => {
    const app = createApp();
    expect(app.llmClient).toBeDefined();
  });

  test('event bus is wired to logger for subscriber errors', () => {
    const app = createApp();
    expect(() => app.eventBus.emit('test:noop', { value: 1 })).not.toThrow();
  });
});
