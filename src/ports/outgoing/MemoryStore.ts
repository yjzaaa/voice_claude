/**
 * 持久化记忆存储端口，用于保存用户偏好、高风险工具白名单等长期状态。
 */
export interface MemoryStore {
  /**
   * 读取指定键的值。
   * @param key - 存储键
   */
  get<T>(key: string): Promise<T | undefined>;
  /**
   * 写入指定键的值。
   * @param key - 存储键
   * @param value - 要保存的值
   */
  set<T>(key: string, value: T): Promise<void>;
}
