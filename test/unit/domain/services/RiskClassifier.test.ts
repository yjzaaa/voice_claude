import { RiskClassifier } from '../../../../src/domain/services/RiskClassifier';
import { Plan } from '../../../../src/domain/models/Plan';

describe('RiskClassifier', () => {
  const classifier = new RiskClassifier({
    get_window_list: 'read',
    focus_window: 'low',
    send_text: 'low',
    launch_process: 'medium',
    close_window: 'high',
  });

  test('allows auto-execution for read and low risk tools', () => {
    const plan: Plan = {
      goal: 'focus terminal and send text',
      steps: [
        { tool: 'focus_window', params: { windowId: 'terminal-1' } },
        { tool: 'send_text', params: { text: 'hello' } },
      ],
    };

    const result = classifier.classify(plan);

    expect(result.canAutoExecute).toBe(true);
    expect(result.steps[0].risk).toBe('low');
    expect(result.steps[1].risk).toBe('low');
  });

  test('blocks auto-execution for high risk tools', () => {
    const plan: Plan = {
      goal: 'close terminal',
      steps: [{ tool: 'close_window', params: { windowId: 'terminal-1' } }],
    };

    const result = classifier.classify(plan);

    expect(result.canAutoExecute).toBe(false);
    expect(result.steps[0].risk).toBe('high');
  });

  test('blocks auto-execution when any step is high risk', () => {
    const plan: Plan = {
      goal: 'send text then close',
      steps: [
        { tool: 'send_text', params: { text: 'done' } },
        { tool: 'close_window', params: { windowId: 'terminal-1' } },
      ],
    };

    const result = classifier.classify(plan);

    expect(result.canAutoExecute).toBe(false);
  });

  test('allows auto-execution for whitelisted high-risk tools', () => {
    const plan: Plan = {
      goal: 'close terminal',
      steps: [{ tool: 'close_window', params: { windowId: 'terminal-1' } }],
    };

    const result = classifier.classify(plan, ['close_window']);

    expect(result.canAutoExecute).toBe(true);
    expect(result.steps[0].risk).toBe('high');
  });
});
