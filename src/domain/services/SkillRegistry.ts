import * as path from 'path';
import { Plan } from '../models/Plan';

/** 被 SkillRegistry 加载的单个技能。 */
export interface Skill {
  /** 技能唯一标识 */
  name: string;
  /** 可触发该技能的语音子串列表 */
  patterns: string[];
  /** 触发后应执行的计划 */
  plan: Plan;
  /** 是否启用；默认 true */
  enabled?: boolean;
}

/** 技能匹配结果。 */
export interface SkillMatch {
  /** 匹配到的技能名称 */
  skill: string;
  /** 该技能对应的执行计划 */
  plan: Plan;
}

/** 文件系统最小子集，便于测试注入。 */
interface FileSystem {
  existsSync(path: string): boolean;
  readdirSync(path: string): string[];
  readFileSync(path: string, encoding: 'utf-8'): string;
}

/**
 * 技能注册表：从 JSON 文件加载用户自定义语音指令模板。
 * 当 ASR 文本匹配某个技能的 pattern 时，直接返回该技能预定义的计划，
 * 避免对高频、确定性指令重复调用 LLM。
 */
export class SkillRegistry {
  private skills: Skill[] = [];

  /**
   * @param skillsDir - 技能 JSON 文件所在目录
   * @param fs - 文件系统实现
   */
  constructor(
    private skillsDir: string,
    private fs: FileSystem,
  ) {}

  /** 从 skillsDir 加载所有 .json 技能文件。 */
  load(): void {
    this.skills = [];
    if (!this.fs.existsSync(this.skillsDir)) return;

    const files = this.fs.readdirSync(this.skillsDir).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      try {
        const raw = this.fs.readFileSync(path.join(this.skillsDir, file), 'utf-8');
        const skill = JSON.parse(raw) as Skill;
        if (skill.name && Array.isArray(skill.patterns) && skill.plan) {
          this.skills.push({ enabled: true, ...skill });
        }
      } catch {
        // 跳过格式损坏的技能文件，避免一个坏文件导致全部不可用
      }
    }
  }

  /** 重新加载技能文件；可用于文件变更后的热重载。 */
  reload(): void {
    this.load();
  }

  /**
   * 获取当前已加载的技能列表（含启用状态）。
   * 返回浅拷贝，避免外部直接修改内部数组。
   */
  getSkills(): Skill[] {
    return this.skills.map((s) => ({ ...s }));
  }

  /**
   * 启用指定技能。
   * @param name - 技能名称
   * @returns 是否找到并启用该技能
   */
  enable(name: string): boolean {
    const skill = this.skills.find((s) => s.name === name);
    if (!skill) return false;
    skill.enabled = true;
    return true;
  }

  /**
   * 禁用指定技能；禁用后 match() 不再命中该技能。
   * @param name - 技能名称
   * @returns 是否找到并禁用该技能
   */
  disable(name: string): boolean {
    const skill = this.skills.find((s) => s.name === name);
    if (!skill) return false;
    skill.enabled = false;
    return true;
  }

  /**
   * 查询指定技能是否启用。
   * @param name - 技能名称
   */
  isEnabled(name: string): boolean {
    const found = this.skills.find((s) => s.name === name);
    if (!found) return false;
    return found.enabled !== false;
  }

  /**
   * 尝试用文本匹配已加载且启用的技能。
   * @param text - ASR 识别后的用户文本
   * @returns 匹配结果；无匹配时返回 undefined
   */
  match(text: string): SkillMatch | undefined {
    for (const skill of this.skills) {
      if (skill.enabled === false) continue;
      for (const pattern of skill.patterns) {
        if (text.includes(pattern)) {
          return { skill: skill.name, plan: skill.plan };
        }
      }
    }
    return undefined;
  }
}
