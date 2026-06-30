import * as path from 'path';
import { AgentPlanner } from '../../../../src/domain/services/AgentPlanner';
import { LlmClient } from '../../../../src/ports/incoming/LlmClient';
import { ToolRegistry } from '../../../../src/domain/services/ToolRegistry';
import { AgentPlannerContext } from '../../../../src/domain/services/AgentPlanner';
import { SkillRegistry } from '../../../../src/domain/services/SkillRegistry';

interface FakeFs {
  existsSync(path: string): boolean;
  readdirSync(path: string): string[];
  readFileSync(path: string, encoding: 'utf-8'): string;
}

const fakeFs = (dir: string, files: Record<string, string>): FakeFs => ({
  existsSync: () => true,
  readdirSync: () => Object.keys(files),
  readFileSync: (p) => {
    for (const [name, content] of Object.entries(files)) {
      if (p === path.join(dir, name)) return content;
    }
    return '';
  },
});

describe('AgentPlanner', () => {
  const createLlm = (response: string | null): LlmClient => ({
    complete: jest.fn().mockResolvedValue(response),
  });

  const createRegistry = (): ToolRegistry => {
    const registry = new ToolRegistry();
    registry.register({
      name: 'send_text',
      description: 'Send text to the active window',
      parameters: { type: 'object', properties: { text: { type: 'string' } } },
      risk: 'low',
      execute: jest.fn(),
    });
    return registry;
  };

  const emptyContext: AgentPlannerContext = {
    windows: [],
    recentActions: [],
    preferences: {},
  };

  test('parses a command response and returns a plan', async () => {
    const llm = createLlm(
      JSON.stringify({
        isCommand: true,
        confidence: 0.95,
        plan: {
          goal: 'send greeting',
          steps: [{ tool: 'send_text', params: { text: 'hello' } }],
        },
        reason: 'user wants to send text',
      }),
    );
    const planner = new AgentPlanner(llm, createRegistry());

    const result = await planner.plan('send hello', emptyContext);

    expect(result.isCommand).toBe(true);
    expect(result.confidence).toBe(0.95);
    expect(result.plan?.steps).toHaveLength(1);
    expect(result.plan?.steps[0].tool).toBe('send_text');
  });

  test('parses a non-command response', async () => {
    const llm = createLlm(
      JSON.stringify({
        isCommand: false,
        confidence: 0.88,
        reason: 'this is casual chat',
      }),
    );
    const planner = new AgentPlanner(llm, createRegistry());

    const result = await planner.plan('how is the weather', emptyContext);

    expect(result.isCommand).toBe(false);
    expect(result.plan).toBeUndefined();
  });

  test('extracts JSON from markdown code fences', async () => {
    const llm = createLlm(
      `Some explanation\n\n\`\`\`json\n${JSON.stringify({
        isCommand: true,
        confidence: 0.9,
        plan: { goal: 'x', steps: [{ tool: 'send_text', params: { text: 'x' } }] },
      })}\n\`\`\``,
    );
    const planner = new AgentPlanner(llm, createRegistry());

    const result = await planner.plan('x', emptyContext);

    expect(result.isCommand).toBe(true);
    expect(result.plan?.steps).toHaveLength(1);
  });

  test('returns skill plan directly without calling LLM when skill matches', async () => {
    const llm = createLlm(null);
    const skills = new SkillRegistry(
      '/skills',
      fakeFs('/skills', {
        'open-claude.json': JSON.stringify({
          name: 'open-claude',
          patterns: ['打开 Claude'],
          plan: {
            goal: 'open Claude Code',
            steps: [{ tool: 'launch_process', params: { command: 'claude' } }],
          },
        }),
      }),
    );
    skills.load();
    const planner = new AgentPlanner(llm, createRegistry(), skills);

    const result = await planner.plan('打开 Claude Code', emptyContext);

    expect(result.isCommand).toBe(true);
    expect(result.confidence).toBe(1);
    expect(result.plan?.goal).toBe('open Claude Code');
    expect(llm.complete).not.toHaveBeenCalled();
  });
});
