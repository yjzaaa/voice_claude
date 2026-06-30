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
});
