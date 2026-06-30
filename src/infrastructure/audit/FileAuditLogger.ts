import { AuditLogger, AuditEntry } from '../../ports/outgoing/AuditLogger';
import * as path from 'path';

/** 文件系统最小子集，便于测试注入。 */
interface FileSystem {
  existsSync(p: string): boolean;
  mkdirSync(p: string, options: { recursive: boolean }): void;
  appendFileSync(p: string, content: string): void;
}

/**
 * 基于 JSON Lines 文件的审计日志实现。
 * 每条记录独立一行，便于追加和按行读取。
 */
export class FileAuditLogger implements AuditLogger {
  /**
   * @param filePath - 审计日志文件路径
   * @param fs - 文件系统实现
   */
  constructor(
    private filePath: string,
    private fs: FileSystem,
  ) {}

  log(entry: AuditEntry): void {
    const dir = path.dirname(this.filePath);
    // 确保日志目录存在，避免首次写入失败
    if (!this.fs.existsSync(dir)) {
      this.fs.mkdirSync(dir, { recursive: true });
    }
    this.fs.appendFileSync(this.filePath, JSON.stringify(entry) + '\n');
  }
}
