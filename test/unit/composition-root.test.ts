import { createApp } from '../../src/composition-root';
import { CompositeAsrEngine } from '../../src/adapters/asr/CompositeAsrEngine';

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

  test('assembles agent services', () => {
    const app = createApp();
    expect(app.asrEngine).toBeDefined();
    expect(app.asrEngine).toBeInstanceOf(CompositeAsrEngine);
    expect(app.asrEngine.name).toBe('composite');
    expect(app.toolRegistry).toBeDefined();
    expect(app.skillRegistry).toBeDefined();
    expect(app.riskClassifier).toBeDefined();
    expect(app.planExecutor).toBeDefined();
    expect(app.agentPlanner).toBeDefined();
    expect(app.voiceAgent).toBeDefined();
    expect(app.memoryStore).toBeDefined();
    expect(app.auditLogger).toBeDefined();
    expect(app.windowRepository).toBeDefined();
    expect(app.scheduler).toBeDefined();
  });

  test('event bus is wired to logger for subscriber errors', () => {
    const app = createApp();
    expect(() => app.eventBus.emit('test:noop', { value: 1 })).not.toThrow();
  });
});
