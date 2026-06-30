import { MemoryStore } from '../../ports/outgoing/MemoryStore';

/** 文件系统最小子集，便于测试注入。 */
interface FileSystem {
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding: 'utf-8'): string;
  writeFileSync(path: string, content: string): void;
}

/**
 * 基于 JSON 文件的持久化记忆存储。
 * 每个键值对保存在同一个 JSON 对象中，便于人工查看和备份。
 */
export class JsonFileMemoryStore implements MemoryStore {
  /**
   * @param filePath - 存储文件路径
   * @param fs - 文件系统实现
   */
  constructor(
    private filePath: string,
    private fs: FileSystem,
  ) {}

  async get<T>(key: string): Promise<T | undefined> {
    if (!this.fs.existsSync(this.filePath)) return undefined;
    const raw = this.fs.readFileSync(this.filePath, 'utf-8');
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(raw);
    } catch {
      // 文件损坏时视为空存储，避免整次读取失败
      data = {};
    }
    return data[key] as T | undefined;
  }

  async set<T>(key: string, value: T): Promise<void> {
    let data: Record<string, unknown> = {};
    if (this.fs.existsSync(this.filePath)) {
      const raw = this.fs.readFileSync(this.filePath, 'utf-8');
      try {
        data = JSON.parse(raw);
      } catch {
        data = {};
      }
    }
    data[key] = value;
    this.fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
  }
}
