import { VoiceAgent } from '../../../../src/application/agent/VoiceAgent';
import { AsrEngine } from '../../../../src/ports/incoming/AsrEngine';
import {
  AgentPlanner,
  AgentPlannerContext,
  AgentPlannerResponse,
} from '../../../../src/domain/services/AgentPlanner';
import { RiskClassifier } from '../../../../src/domain/services/RiskClassifier';
import { PlanExecutor, PlanExecutionResult } from '../../../../src/domain/services/PlanExecutor';
import { ToolRegistry } from '../../../../src/domain/services/ToolRegistry';
import { EventBus } from '../../../../src/application/events/EventBus';
import { AuditLogger, AuditEntry } from '../../../../src/ports/outgoing/AuditLogger';

describe('VoiceAgent', () => {
  const createAsr = (text: string | null): AsrEngine => ({
    name: 'mock',
    transcribe: jest.fn().mockResolvedValue(text),
    isAvailable: () => true,
  });

  const createPlanner = (response: AgentPlannerResponse): AgentPlanner => {
    const planner = new AgentPlanner(
      { complete: jest.fn().mockResolvedValue(JSON.stringify(response)) } as any,
      new ToolRegistry(),
    );
    jest.spyOn(planner, 'plan').mockResolvedValue(response);
    return planner;
  };

  const createClassifier = (): RiskClassifier => {
    const classifier = new RiskClassifier({ send_text: 'low', close_window: 'high' });
    jest.spyOn(classifier, 'classify').mockImplementation((plan, whitelist: string[] = []) => ({
      goal: plan.goal,
      steps: plan.steps.map((s) => ({
        ...s,
        risk: (s.tool === 'close_window' ? 'high' : 'low') as any,
      })),
      canAutoExecute: !plan.steps.some(
        (s) => s.tool === 'close_window' && !whitelist.includes(s.tool),
      ),
    }));
    return classifier;
  };

  const createExecutor = (result: PlanExecutionResult): PlanExecutor => {
    const registry = new ToolRegistry();
    const executor = new PlanExecutor(registry);
    jest.spyOn(executor, 'execute').mockResolvedValue(result);
    return executor;
  };

  const createAudit = (): AuditLogger => ({
    log: jest.fn(),
  });

  test('runs a low-risk command successfully and emits success', async () => {
    const events: string[] = [];
    const bus = new EventBus();
    bus.on('agent:success', () => events.push('success'));

    const response: AgentPlannerResponse = {
      isCommand: true,
      confidence: 0.9,
      plan: { goal: 'send hi', steps: [{ tool: 'send_text', params: { text: 'hi' } }] },
    };
    const audit = createAudit();
    const agent = new VoiceAgent(
      createAsr('send hi'),
      createPlanner(response),
      createClassifier(),
      createExecutor({ status: 'success' }),
      bus,
      audit,
    );

    await agent.onPcm(Buffer.from('pcm'));

    expect(events).toEqual(['success']);
    expect(audit.log).toHaveBeenCalledTimes(1);
    const entry = (audit.log as jest.Mock).mock.calls[0][0] as AuditEntry;
    expect(entry.triggerText).toBe('send hi');
    expect(entry.executionResult.status).toBe('success');
  });

  test('ignores low-confidence utterances and emits ignored', async () => {
    const events: Array<{ event: string; payload?: unknown }> = [];
    const bus = new EventBus();
    bus.on('agent:ignored', (p) => events.push({ event: 'ignored', payload: p }));

    const response: AgentPlannerResponse = {
      isCommand: false,
      confidence: 0.3,
      reason: 'casual chat',
    };
    const audit = createAudit();
    const agent = new VoiceAgent(
      createAsr('nice weather'),
      createPlanner(response),
      createClassifier(),
      createExecutor({ status: 'success' }),
      bus,
      audit,
    );

    await agent.onPcm(Buffer.from('pcm'));

    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('ignored');
    expect(audit.log).toHaveBeenCalledTimes(1);
  });

  test('requests permission for high-risk plans when tools are not whitelisted', async () => {
    const events: Array<{ event: string; payload?: unknown }> = [];
    const bus = new EventBus();
    bus.on('agent:permission-request', (p) =>
      events.push({ event: 'permission-request', payload: p }),
    );

    const response: AgentPlannerResponse = {
      isCommand: true,
      confidence: 0.9,
      plan: {
        goal: 'close terminal',
        steps: [{ tool: 'close_window', params: { windowId: 't1' } }],
      },
    };
    const audit = createAudit();
    const agent = new VoiceAgent(
      createAsr('close terminal'),
      createPlanner(response),
      createClassifier(),
      createExecutor({ status: 'success' }),
      bus,
      audit,
    );

    await agent.onPcm(Buffer.from('pcm'));

    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('permission-request');
    expect((events[0].payload as any).tools).toEqual(['close_window']);
    expect(audit.log).toHaveBeenCalledTimes(1);
  });

  test('auto-executes high-risk plans when tools are whitelisted', async () => {
    const events: string[] = [];
    const bus = new EventBus();
    bus.on('agent:success', () => events.push('success'));

    const response: AgentPlannerResponse = {
      isCommand: true,
      confidence: 0.9,
      plan: {
        goal: 'close terminal',
        steps: [{ tool: 'close_window', params: { windowId: 't1' } }],
      },
    };
    const audit = createAudit();
    const agent = new VoiceAgent(
      createAsr('close terminal'),
      createPlanner(response),
      createClassifier(),
      createExecutor({ status: 'success' }),
      bus,
      audit,
      () => ({ windows: [], recentActions: [], preferences: {}, riskWhitelist: ['close_window'] }),
    );

    await agent.onPcm(Buffer.from('pcm'));

    expect(events).toEqual(['success']);
    expect(audit.log).toHaveBeenCalledTimes(1);
  });

  test('awaits async context provider and passes result to planner', async () => {
    const bus = new EventBus();
    const planner = createPlanner({
      isCommand: false,
      confidence: 0.2,
      reason: 'not a command',
    });
    const plannerSpy = jest.spyOn(planner, 'plan');
    const context: AgentPlannerContext = {
      windows: [{ id: '1', title: 'Notes' }],
      recentActions: ['opened terminal'],
      preferences: { theme: 'dark' },
    };
    const agent = new VoiceAgent(
      createAsr('hello'),
      planner,
      createClassifier(),
      createExecutor({ status: 'success' }),
      bus,
      createAudit(),
      () => Promise.resolve(context),
    );

    await agent.onPcm(Buffer.from('pcm'));

    expect(plannerSpy).toHaveBeenCalledWith('hello', context);
  });

  test('retries ASR once on failure and emits asr-failed on persistent failure', async () => {
    const events: Array<{ event: string; payload?: unknown }> = [];
    const bus = new EventBus();
    bus.on('agent:asr-failed', (p) => events.push({ event: 'asr-failed', payload: p }));

    const transcribe = jest.fn().mockRejectedValue(new Error('network down'));
    const asr: AsrEngine = { name: 'mock', transcribe, isAvailable: () => true };
    const agent = new VoiceAgent(
      asr,
      createPlanner({ isCommand: false, confidence: 0.2, reason: 'not a command' }),
      createClassifier(),
      createExecutor({ status: 'success' }),
      bus,
      createAudit(),
    );

    await agent.onPcm(Buffer.from('pcm'));

    expect(transcribe).toHaveBeenCalledTimes(2);
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('asr-failed');
    expect((events[0].payload as any).error).toBe('network down');
  });

  test('succeeds on ASR retry after first failure', async () => {
    const events: string[] = [];
    const bus = new EventBus();
    bus.on('agent:success', () => events.push('success'));

    let attempt = 0;
    const transcribe = jest.fn().mockImplementation(() => {
      attempt += 1;
      if (attempt === 1) return Promise.reject(new Error('timeout'));
      return Promise.resolve('send hi');
    });
    const asr: AsrEngine = { name: 'mock', transcribe, isAvailable: () => true };
    const response: AgentPlannerResponse = {
      isCommand: true,
      confidence: 0.9,
      plan: { goal: 'send hi', steps: [{ tool: 'send_text', params: { text: 'hi' } }] },
    };

    const agent = new VoiceAgent(
      asr,
      createPlanner(response),
      createClassifier(),
      createExecutor({ status: 'success' }),
      bus,
      createAudit(),
    );

    await agent.onPcm(Buffer.from('pcm'));

    expect(attempt).toBe(2);
    expect(transcribe).toHaveBeenCalledTimes(2);
    expect(events).toEqual(['success']);
  });
});
