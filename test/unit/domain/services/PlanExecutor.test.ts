import { PlanExecutor } from '../../../../src/domain/services/PlanExecutor';
import { ToolRegistry } from '../../../../src/domain/services/ToolRegistry';
import { ClassifiedPlan } from '../../../../src/domain/services/RiskClassifier';

describe('PlanExecutor', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  test('executes all steps successfully', async () => {
    const log: string[] = [];
    registry.register({
      name: 'a',
      description: '',
      parameters: {},
      risk: 'low',
      execute: async () => {
        log.push('a');
      },
    });
    registry.register({
      name: 'b',
      description: '',
      parameters: {},
      risk: 'low',
      execute: async () => {
        log.push('b');
      },
    });
    const executor = new PlanExecutor(registry, 1);
    const plan: ClassifiedPlan = {
      goal: 'run a then b',
      steps: [
        { tool: 'a', params: {}, risk: 'low' },
        { tool: 'b', params: {}, risk: 'low' },
      ],
      canAutoExecute: true,
    };

    const result = await executor.execute(plan);

    expect(result.status).toBe('success');
    expect(log).toEqual(['a', 'b']);
  });

  test('retries a failing step until it succeeds', async () => {
    let attempts = 0;
    registry.register({
      name: 'flaky',
      description: '',
      parameters: {},
      risk: 'low',
      execute: async () => {
        attempts++;
        if (attempts < 3) throw new Error('fail');
      },
    });
    const executor = new PlanExecutor(registry, 3);
    const plan: ClassifiedPlan = {
      goal: 'retry flaky',
      steps: [{ tool: 'flaky', params: {}, risk: 'low' }],
      canAutoExecute: true,
    };

    const result = await executor.execute(plan);

    expect(result.status).toBe('success');
    expect(attempts).toBe(3);
  });

  test('returns step-failed after exhausting retries', async () => {
    registry.register({
      name: 'always-fails',
      description: '',
      parameters: {},
      risk: 'low',
      execute: async () => {
        throw new Error('broken');
      },
    });
    const executor = new PlanExecutor(registry, 2);
    const plan: ClassifiedPlan = {
      goal: 'will fail',
      steps: [{ tool: 'always-fails', params: {}, risk: 'low' }],
      canAutoExecute: true,
    };

    const result = await executor.execute(plan);

    expect(result.status).toBe('step-failed');
    expect(result.failedStep?.tool).toBe('always-fails');
    expect(result.error).toBeInstanceOf(Error);
  });

  test('stops executing after a step fails', async () => {
    registry.register({
      name: 'fail',
      description: '',
      parameters: {},
      risk: 'low',
      execute: async () => {
        throw new Error('nope');
      },
    });
    const later = jest.fn();
    registry.register({
      name: 'later',
      description: '',
      parameters: {},
      risk: 'low',
      execute: later,
    });
    const executor = new PlanExecutor(registry, 1);
    const plan: ClassifiedPlan = {
      goal: 'stop on failure',
      steps: [
        { tool: 'fail', params: {}, risk: 'low' },
        { tool: 'later', params: {}, risk: 'low' },
      ],
      canAutoExecute: true,
    };

    await executor.execute(plan);

    expect(later).not.toHaveBeenCalled();
  });

  test('returns executed steps before the failed step', async () => {
    registry.register({
      name: 'ok',
      description: '',
      parameters: {},
      risk: 'low',
      execute: async () => {},
    });
    registry.register({
      name: 'fail',
      description: '',
      parameters: {},
      risk: 'low',
      execute: async () => {
        throw new Error('nope');
      },
    });
    const executor = new PlanExecutor(registry, 1);
    const plan: ClassifiedPlan = {
      goal: 'record progress',
      steps: [
        { tool: 'ok', params: { id: 1 }, risk: 'low' },
        { tool: 'ok', params: { id: 2 }, risk: 'low' },
        { tool: 'fail', params: {}, risk: 'low' },
      ],
      canAutoExecute: true,
    };

    const result = await executor.execute(plan);

    expect(result.status).toBe('step-failed');
    expect(result.executedSteps).toEqual([
      { tool: 'ok', params: { id: 1 }, risk: 'low' },
      { tool: 'ok', params: { id: 2 }, risk: 'low' },
    ]);
  });

  test('emits retry events through onRetry callback', async () => {
    let attempts = 0;
    registry.register({
      name: 'flaky',
      description: '',
      parameters: {},
      risk: 'low',
      execute: async () => {
        attempts++;
        if (attempts < 3) throw new Error('fail');
      },
    });
    const retryEvents: Array<{ attempt: number; maxRetries: number; error: unknown }> = [];
    const executor = new PlanExecutor(registry, 3, (event) => {
      retryEvents.push({
        attempt: event.attempt,
        maxRetries: event.maxRetries,
        error: event.error,
      });
    });
    const plan: ClassifiedPlan = {
      goal: 'retry with events',
      steps: [{ tool: 'flaky', params: {}, risk: 'low' }],
      canAutoExecute: true,
    };

    const result = await executor.execute(plan);

    expect(result.status).toBe('success');
    expect(retryEvents).toHaveLength(2);
    expect(retryEvents[0].attempt).toBe(1);
    expect(retryEvents[0].maxRetries).toBe(3);
    expect(retryEvents[1].attempt).toBe(2);
  });
});
