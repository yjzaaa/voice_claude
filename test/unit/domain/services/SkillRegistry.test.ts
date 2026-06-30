import * as path from 'path';
import { SkillRegistry } from '../../../../src/domain/services/SkillRegistry';

interface FakeFs {
  existsSync(path: string): boolean;
  readdirSync(path: string): string[];
  readFileSync(path: string, encoding: 'utf-8'): string;
}

describe('SkillRegistry', () => {
  const createFs = (dir: string, files: Record<string, string>): FakeFs => ({
    existsSync: (p) => p === dir,
    readdirSync: () => Object.keys(files),
    readFileSync: (p) => {
      for (const [name, content] of Object.entries(files)) {
        if (p === path.join(dir, name)) return content;
      }
      return '';
    },
  });

  test('returns undefined when skills directory does not exist', () => {
    const registry = new SkillRegistry('/missing', {
      existsSync: () => false,
      readdirSync: () => [],
      readFileSync: () => '',
    } as unknown as FakeFs);

    registry.load();

    expect(registry.match('anything')).toBeUndefined();
  });

  test('matches a skill by substring and returns its plan', () => {
    const registry = new SkillRegistry(
      '/skills',
      createFs('/skills', {
        'open-claude.json': JSON.stringify({
          name: 'open-claude',
          patterns: ['打开 Claude', '启动 Claude'],
          plan: {
            goal: 'open Claude Code',
            steps: [{ tool: 'launch_process', params: { command: 'claude' } }],
          },
        }),
      }),
    );

    registry.load();

    const match = registry.match('帮我打开 Claude Code');
    expect(match).toBeDefined();
    expect(match?.skill).toBe('open-claude');
    expect(match?.plan.goal).toBe('open Claude Code');
  });

  test('returns undefined when no pattern matches', () => {
    const registry = new SkillRegistry(
      '/skills',
      createFs('/skills', {
        'open-claude.json': JSON.stringify({
          name: 'open-claude',
          patterns: ['打开 Claude'],
          plan: { goal: 'open Claude Code', steps: [] },
        }),
      }),
    );

    registry.load();

    expect(registry.match('今天天气怎么样')).toBeUndefined();
  });

  test('skips malformed skill files and continues loading', () => {
    const registry = new SkillRegistry(
      '/skills',
      createFs('/skills', {
        'bad.json': 'not json',
        'good.json': JSON.stringify({
          name: 'good',
          patterns: ['好的'],
          plan: { goal: 'confirm', steps: [] },
        }),
      }),
    );

    registry.load();

    expect(registry.match('好的')).toBeDefined();
  });
});
