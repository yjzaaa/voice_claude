/**
 * AudioCollector — Web Speech API 在渲染进程运行，通过 IPC 投喂
 */
import { EventEmitter } from 'events';

export class AudioCollector extends EventEmitter {
  private buffer: string[] = [];
  private lastText = '';

  /** 渲染进程 IPC 过来的文字 */
  feed(text: string) {
    this.buffer.push(text);
    this.emit('text', text);
  }

  /** 去重检查 */
  isDuplicate(text: string): boolean {
    if (text === this.lastText) return true;
    if (this.lastText && (text.includes(this.lastText) || this.lastText.includes(text))) return true;
    this.lastText = text;
    return false;
  }
}
