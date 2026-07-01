import * as path from 'path';
import { syncDefaultSkills } from '../../../../src/infrastructure/skills/syncDefaultSkills';

interface FakeFs {
  existsSync(path: string): boolean;
  mkdirSync(path: string, options?: { recursive?: boolean }): void;
  readdirSync(path: string): string[];
  copyFileSync(src: string, dest: string): void;
}

describe('syncDefaultSkills', () => {
  const defaultsDir = '/app/assets/skills';
  const userDir = '/home/user/.voice_claude/skills';

  const createFs = (state: {
    defaults: Record<string, string>;
    existing: Record<string, string>;
  }) => {
    const files: Record<string, string | null> = {
      ...Object.fromEntries(
        Object.entries(state.defaults).map(([k, v]) => [path.join(defaultsDir, k), v]),
      ),
      ...Object.fromEntries(
        Object.entries(state.existing).map(([k, v]) => [path.join(userDir, k), v]),
      ),
    };

    const dirs = new Set([defaultsDir]);
    for (const f of Object.keys(files)) {
      dirs.add(path.dirname(f));
    }

    return {
      existsSync: (p: string) => dirs.has(p) || files[p] !== undefined,
      mkdirSync: jest.fn((p: string) => dirs.add(p)),
      readdirSync: (p: string) => {
        if (p === defaultsDir) return Object.keys(state.defaults);
        if (p === userDir) return Object.keys(state.existing);
        return [];
      },
      copyFileSync: jest.fn((src: string, dest: string) => {
        files[dest] = files[src] ?? null;
      }),
    } as unknown as FakeFs;
  };

  test('copies defaults when user dir does not exist', () => {
    const fsLike = createFs({
      defaults: {
        'open-claude.json': '{}',
        'switch-terminal.json': '{}',
      },
      existing: {},
    });

    syncDefaultSkills(defaultsDir, userDir, fsLike);

    expect(fsLike.mkdirSync).toHaveBeenCalledWith(userDir, { recursive: true });
    expect(fsLike.copyFileSync).toHaveBeenCalledTimes(2);
    expect(fsLike.copyFileSync).toHaveBeenCalledWith(
      path.join(defaultsDir, 'open-claude.json'),
      path.join(userDir, 'open-claude.json'),
    );
  });

  test('copies defaults when user dir is empty', () => {
    const fsLike = createFs({
      defaults: { 'open-claude.json': '{}' },
      existing: {},
    });

    syncDefaultSkills(defaultsDir, userDir, fsLike);

    expect(fsLike.copyFileSync).toHaveBeenCalledTimes(1);
  });

  test('does not overwrite existing skill files', () => {
    const fsLike = createFs({
      defaults: { 'open-claude.json': '{"version": 2}' },
      existing: { 'open-claude.json': '{"version": 1}' },
    });

    syncDefaultSkills(defaultsDir, userDir, fsLike);

    expect(fsLike.copyFileSync).not.toHaveBeenCalled();
  });

  test('does nothing when defaults dir does not exist', () => {
    const fsLike = {
      existsSync: () => false,
      mkdirSync: jest.fn(),
      readdirSync: jest.fn(),
      copyFileSync: jest.fn(),
    } as unknown as FakeFs;

    syncDefaultSkills('/missing', userDir, fsLike);

    expect(fsLike.mkdirSync).not.toHaveBeenCalled();
    expect(fsLike.copyFileSync).not.toHaveBeenCalled();
  });
});
