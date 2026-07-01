import * as path from 'path';

export interface SkillFileSystem {
  existsSync(path: string): boolean;
  mkdirSync(path: string, options?: { recursive?: boolean }): void;
  readdirSync(path: string): string[];
  copyFileSync(src: string, dest: string): void;
}

/**
 * 同步默认技能文件到用户技能目录。
 * 若用户目录不存在则创建；若用户目录中已有任意 .json 技能文件，则不覆盖。
 *
 * @param defaultsDir - 项目内置默认技能目录
 * @param userDir - 用户技能目录
 * @param fsLike - 文件系统实现（便于测试注入）
 */
export function syncDefaultSkills(
  defaultsDir: string,
  userDir: string,
  fsLike: SkillFileSystem,
): void {
  if (!fsLike.existsSync(defaultsDir)) return;

  if (!fsLike.existsSync(userDir)) {
    fsLike.mkdirSync(userDir, { recursive: true });
  }

  const existing = fsLike.readdirSync(userDir).filter((f) => f.toLowerCase().endsWith('.json'));
  if (existing.length > 0) return;

  const defaults = fsLike.readdirSync(defaultsDir).filter((f) => f.toLowerCase().endsWith('.json'));

  for (const file of defaults) {
    fsLike.copyFileSync(path.join(defaultsDir, file), path.join(userDir, file));
  }
}
