import {
  VoiceAgentError,
  AsrError,
  PlannerError,
  ToolExecutionError,
  PermissionDeniedError,
} from '../../../../src/domain/errors/VoiceAgentError';

describe('VoiceAgentError taxonomy', () => {
  test('base error carries component and cause', () => {
    const cause = new Error(' underlying failure');
    const err = new VoiceAgentError('something went wrong', 'test', cause);

    expect(err.message).toBe('something went wrong');
    expect(err.component).toBe('test');
    expect(err.cause).toBe(cause);
    expect(err.name).toBe('VoiceAgentError');
  });

  test('AsrError tags component as asr', () => {
    const cause = new Error('mic unavailable');
    const err = new AsrError('recognition failed', cause);

    expect(err.component).toBe('asr');
    expect(err.cause).toBe(cause);
    expect(err.name).toBe('AsrError');
  });

  test('PlannerError tags component as planner', () => {
    const cause = new Error('timeout');
    const err = new PlannerError('llm call failed', cause);

    expect(err.component).toBe('planner');
    expect(err.cause).toBe(cause);
    expect(err.name).toBe('PlannerError');
  });

  test('ToolExecutionError names the failing tool and preserves cause', () => {
    const cause = new Error('window not found');
    const err = new ToolExecutionError('focus_window', cause);

    expect(err.tool).toBe('focus_window');
    expect(err.component).toBe('tool');
    expect(err.cause).toBe(cause);
    expect(err.message).toContain('focus_window');
    expect(err.name).toBe('ToolExecutionError');
  });

  test('PermissionDeniedError lists blocked tools', () => {
    const err = new PermissionDeniedError(['close_window', 'launch_process']);

    expect(err.component).toBe('permission');
    expect(err.tools).toEqual(['close_window', 'launch_process']);
    expect(err.message).toContain('close_window');
    expect(err.message).toContain('launch_process');
    expect(err.name).toBe('PermissionDeniedError');
  });
});
