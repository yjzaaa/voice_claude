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

  test('returns all loaded skills with getSkills', () => {
    const registry = new SkillRegistry(
      '/skills',
      createFs('/skills', {
        'a.json': JSON.stringify({
          name: 'a',
          patterns: ['a'],
          plan: { goal: 'a', steps: [] },
        }),
        'b.json': JSON.stringify({
          name: 'b',
          patterns: ['b'],
          plan: { goal: 'b', steps: [] },
        }),
      }),
    );

    registry.load();
    const skills = registry.getSkills();

    expect(skills).toHaveLength(2);
    expect(skills.map((s) => s.name)).toEqual(['a', 'b']);
    expect(skills[0].enabled).toBe(true);
  });

  test('can disable and re-enable a skill', () => {
    const registry = new SkillRegistry(
      '/skills',
      createFs('/skills', {
        'toggle.json': JSON.stringify({
          name: 'toggle',
          patterns: ['toggle'],
          plan: { goal: 'toggle', steps: [] },
        }),
      }),
    );

    registry.load();
    expect(registry.match('toggle me')).toBeDefined();

    expect(registry.disable('toggle')).toBe(true);
    expect(registry.isEnabled('toggle')).toBe(false);
    expect(registry.match('toggle me')).toBeUndefined();

    expect(registry.enable('toggle')).toBe(true);
    expect(registry.isEnabled('toggle')).toBe(true);
    expect(registry.match('toggle me')).toBeDefined();
  });

  test('reload() refreshes skills from disk', () => {
    let files: Record<string, string> = {
      'old.json': JSON.stringify({
        name: 'old',
        patterns: ['old'],
        plan: { goal: 'old', steps: [] },
      }),
    };
    const fsLike = {
      existsSync: () => true,
      readdirSync: () => Object.keys(files),
      readFileSync: (p: string) => {
        for (const [name, content] of Object.entries(files)) {
          if (p === path.join('/skills', name)) return content;
        }
        return '';
      },
    };

    const registry = new SkillRegistry('/skills', fsLike as unknown as FakeFs);
    registry.load();
    expect(registry.match('old text')).toBeDefined();

    files = {
      'new.json': JSON.stringify({
        name: 'new',
        patterns: ['new'],
        plan: { goal: 'new', steps: [] },
      }),
    };
    registry.reload();

    expect(registry.match('old text')).toBeUndefined();
    expect(registry.match('new text')).toBeDefined();
  });

  test('disable/enable return false for unknown skill', () => {
    const registry = new SkillRegistry('/skills', {
      existsSync: () => true,
      readdirSync: () => [],
      readFileSync: () => '',
    } as unknown as FakeFs);

    registry.load();

    expect(registry.disable('missing')).toBe(false);
    expect(registry.enable('missing')).toBe(false);
    expect(registry.isEnabled('missing')).toBe(false);
  });

  test('match respects explicit enabled flag from JSON', () => {
    const registry = new SkillRegistry(
      '/skills',
      createFs('/skills', {
        'explicit.json': JSON.stringify({
          name: 'explicit',
          patterns: ['explicit'],
          enabled: false,
          plan: { goal: 'explicit', steps: [] },
        }),
      }),
    );

    registry.load();

    expect(registry.isEnabled('explicit')).toBe(false);
    expect(registry.match('explicit')).toBeUndefined();
  });
});
