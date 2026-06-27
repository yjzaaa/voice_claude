/**
 * ASR 测试录音数据结构 — 记录原始音频→ASR→结果的完整链路
 *
 * 用于: TDD、回归测试、ASR 后端对比、精度追踪
 */
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// ══════════════════════════════════════════════════════
// 数据结构
// ══════════════════════════════════════════════════════

export interface AsrRecording {
  id: string;              // 唯一ID (SHA256前8位)
  source: 'manual' | 'automated' | 'imported';
  raw: {
    file: string;          // PCM文件名
    sampleRate: number;    // 采样率
    bits: number;          // 位深
    channels: number;      // 声道
    durationMs: number;    // 时长
    sizeBytes: number;     // 文件大小
    sha256: string;        // 音频哈希
  };
  expected: {
    text: string;          // 期望文本
    language: string;      // zh-CN / en-US
    speaker: string;       // 说话人标识
    noise: 'quiet'|'normal'|'noisy';  // 环境噪音
    tags: string[];        // 分类标签
  };
  results: AsrResult[];    // 各后端识别结果
  meta: {
    recordedAt: string;    // ISO时间戳
    recordedBy: string;    // 录制人
    notes: string;         // 备注
  };
}

export interface AsrResult {
  backend: 'doubao'|'google'|'vosk'|'whisper';
  text: string;            // 识别文本
  confidence?: number;     // 置信度 (0-1)
  latencyMs: number;       // 延迟
  timestamp: string;       // 测试时间
  error?: string;          // 错误信息
  wordTimestamps?: {word:string, start:number, end:number}[];  // 逐词时间
}

// ══════════════════════════════════════════════════════
// 存储层 — JSON 文件
// ══════════════════════════════════════════════════════

const DB_DIR = path.join(__dirname, '..', '..', 'test', 'asr', 'db');

function dbFile(id: string) { return path.join(DB_DIR, `${id}.json`); }
function assertDir() { try { fs.mkdirSync(DB_DIR, { recursive: true }); } catch {} }

// 计算 PCM 音频哈希
function hashPcm(pcm: Buffer): string {
  return crypto.createHash('sha256').update(pcm).digest('hex').slice(0, 16);
}

// 计算 PCM 音频时长 (ms)
function pcmDuration(pcm: Buffer, sampleRate: number, bits: number, channels: number): number {
  return Math.round((pcm.length * 1000) / (sampleRate * (bits / 8) * channels));
}

/** 创建录音记录 */
export function createRecording(
  pcm: Buffer,
  expected: string,
  options: {
    sampleRate?: number; bits?: number; channels?: number;
    language?: string; speaker?: string; noise?: 'quiet'|'normal'|'noisy';
    tags?: string[]; notes?: string; recordedBy?: string;
  } = {}
): AsrRecording {
  assertDir();
  const sr = options.sampleRate || 16000;
  const bits = options.bits || 16;
  const ch = options.channels || 1;
  const sha = hashPcm(pcm);
  const id = sha.slice(0, 8);

  const rec: AsrRecording = {
    id,
    source: 'manual',
    raw: {
      file: `${id}.pcm`,
      sampleRate: sr, bits, channels: ch,
      durationMs: pcmDuration(pcm, sr, bits, ch),
      sizeBytes: pcm.length,
      sha256: sha,
    },
    expected: {
      text: expected,
      language: options.language || 'zh-CN',
      speaker: options.speaker || 'default',
      noise: options.noise || 'quiet',
      tags: options.tags || [],
    },
    results: [],
    meta: {
      recordedAt: new Date().toISOString(),
      recordedBy: options.recordedBy || 'unknown',
      notes: options.notes || '',
    },
  };

  // 保存 PCM 和 JSON
  fs.writeFileSync(path.join(DB_DIR, rec.raw.file), pcm);
  fs.writeFileSync(dbFile(id), JSON.stringify(rec, null, 2));
  return rec;
}

/** 读取录音记录 */
export function loadRecording(id: string): AsrRecording | null {
  const f = dbFile(id);
  if (!fs.existsSync(f)) return null;
  return JSON.parse(fs.readFileSync(f, 'utf-8'));
}

/** 列出所有录音 */
export function listRecordings(): AsrRecording[] {
  assertDir();
  return fs.readdirSync(DB_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(fs.readFileSync(path.join(DB_DIR, f), 'utf-8')))
    .sort((a, b) => b.meta.recordedAt.localeCompare(a.meta.recordedAt));
}

/** 添加 ASR 结果到录音 */
export function addResult(
  id: string,
  backend: AsrResult['backend'],
  text: string,
  options: { confidence?: number; latencyMs: number; error?: string } = { latencyMs: 0 }
): void {
  const rec = loadRecording(id);
  if (!rec) throw new Error(`Recording ${id} not found`);

  rec.results.push({
    backend,
    text,
    confidence: options.confidence,
    latencyMs: options.latencyMs,
    timestamp: new Date().toISOString(),
    error: options.error,
  });

  fs.writeFileSync(dbFile(id), JSON.stringify(rec, null, 2));
}

/** 计算后端准确率 */
export function accuracy(rec: AsrRecording, backend: AsrResult['backend']): number {
  const results = rec.results.filter(r => r.backend === backend);
  if (!results.length) return 0;

  const expected = rec.expected.text;
  let total = 0;
  for (const r of results) {
    const a = new Set(expected.split(''));
    const b = new Set(r.text.split(''));
    let common = 0;
    for (const c of a) { if (b.has(c)) common++; }
    total += common / Math.max(a.size, b.size);
  }
  return total / results.length;
}

/** 生成对比报告 (Markdown) */
export function compareReport(recs: AsrRecording[]): string {
  let md = '| 录音 | 期望 | Google | Doubao |\n';
  md += '|------|------|--------|--------|\n';

  for (const r of recs) {
    const google = r.results.filter(rr => rr.backend === 'google').map(rr => rr.text).join(' / ') || '-';
    const doubao = r.results.filter(rr => rr.backend === 'doubao').map(rr => rr.text).join(' / ') || '-';
    md += `| ${r.id} | ${r.expected.text} | ${google} | ${doubao} |\n`;
  }
  return md;
}
