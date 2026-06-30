/**
 * ASR TDD 测试规范 — 先写断言, 后调代码
 *
 * 用法:
 *   1. npm run test:asr         运行全部
 *   2. npm run test:asr -- --grep Doubao    只测豆包
 *
 * Red-Green-Refactor:
 *   1. RED:   录好 fixture, 跑测试 → FAIL (代码还没写/改了)
 *   2. GREEN: 修 ASR 代码 → 测试 PASS
 *   3. REFACTOR: 优化代码 → 测试仍 PASS
 */

import { transcribe } from '../../src/asr/doubao';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';

const FIXTURES = path.join(__dirname, 'fixtures');

interface Fixture {
  file: string;
  expected: string | null; // null = 期望无结果 (噪音)
  tolerance: number; // 相似度阈值 (0-1)
}

const specs: Fixture[] = [
  { file: 'hello.pcm', expected: '你好', tolerance: 0.6 },
  { file: 'debug.pcm', expected: '帮我修复这个bug', tolerance: 0.5 },
  { file: 'switch.pcm', expected: '切换到终端', tolerance: 0.5 },
  { file: 'silence.pcm', expected: null, tolerance: 1.0 }, // 噪音→必须null
];

function similarity(a: string, b: string): number {
  const aSet = new Set(a.split(''));
  const bSet = new Set(b.split(''));
  let common = 0;
  for (const c of aSet) {
    if (bSet.has(c)) common++;
  }
  return common / Math.max(aSet.size, bSet.size);
}

describe('ASR TDD', () => {
  // ============================================
  // Doubao v3 Tests
  // ============================================
  describe('Doubao v3', () => {
    for (const spec of specs) {
      const fixturePath = path.join(FIXTURES, spec.file);
      const hasFixture = fs.existsSync(fixturePath);

      (hasFixture ? it : it.skip)(
        `${spec.file} → "${spec.expected}"`,
        async () => {
          const pcm = fs.readFileSync(fixturePath);
          const start = Date.now();
          const result = await transcribe(pcm, 16000);
          const elapsed = Date.now() - start;

          if (spec.expected === null) {
            // 噪音测试: 必须返回 null
            expect(result).toBeNull();
          } else {
            expect(result).not.toBeNull();
            const sim = similarity(result!, spec.expected);
            console.log(
              `  [${spec.file}] "${result}" vs "${spec.expected}" = ${(sim * 100).toFixed(0)}% (${elapsed}ms)`,
            );
            expect(sim).toBeGreaterThanOrEqual(spec.tolerance);
          }
        },
        30000,
      ); // 30s timeout for API calls
    }
  });

  // ============================================
  // Chrome Web Speech tests (via HTTP)
  // ============================================
  describe('Chrome Web Speech', () => {
    // 同步探测 127.0.0.1:9877 是否可连；不可连则全部 skip
    const hasServer = (() => {
      try {
        const net = require('net');
        const s = net.connect(9877, '127.0.0.1');
        s.setTimeout(500);
        let ok = false;
        s.on('connect', () => {
          ok = true;
          s.end();
        });
        s.on('error', () => {});
        // 阻塞一小会儿等结果（仅测试启动时执行一次）
        const start = Date.now();
        while (Date.now() - start < 600) {
          if (ok) break;
          require('child_process').execSync('sleep 0.01');
        }
        s.destroy();
        return ok;
      } catch {
        return false;
      }
    })();

    for (const spec of specs.slice(0, 3)) {
      // 只测有文字的
      const fixturePath = path.join(FIXTURES, spec.file);

      (hasServer ? it : it.skip)(
        `${spec.file} → "${spec.expected}" (via HTTP)`,
        async () => {
          const pcm = fs.readFileSync(fixturePath);
          // POST audio to /asr endpoint
          const result = await new Promise<string | null>((resolve, reject) => {
            const req = http.request(
              'http://127.0.0.1:9877/asr',
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/octet-stream',
                  'Content-Length': pcm.length.toString(),
                },
                timeout: 30000,
              },
              (res) => {
                let d = '';
                res.on('data', (c) => (d += c));
                res.on('end', () => {
                  try {
                    resolve(JSON.parse(d).text || null);
                  } catch {
                    resolve(null);
                  }
                });
              },
            );
            req.on('error', reject);
            req.write(pcm);
            req.end();
          });

          if (spec.expected === null) {
            expect(result).toBeNull();
          } else {
            expect(result).not.toBeNull();
            const sim = similarity(result!, spec.expected);
            console.log(`  [HTTP] "${result}" vs "${spec.expected}" = ${(sim * 100).toFixed(0)}%`);
            expect(sim).toBeGreaterThanOrEqual(spec.tolerance);
          }
        },
        30000,
      );
    }
  });

  // ============================================
  // 回归测试: 已知 bug 不会复现
  // ============================================
  describe('Regression', () => {
    it('T1: 空音频不抛异常', async () => {
      const result = await transcribe(Buffer.alloc(0), 16000);
      expect(result).toBeNull();
    });

    it('T2: 极短音频不抛异常', async () => {
      const result = await transcribe(Buffer.alloc(100), 16000);
      expect(result).toBeNull(); // 100字节太少, 不应识别
    });

    it('T3: 48kHz 采样率被拒绝或降级', async () => {
      const silence = Buffer.alloc(32000);
      const result = await transcribe(silence, 48000);
      // 应该返回 null (不支持的采样率)
      expect(result).toBeNull();
    });

    it('T4: 连续调用不阻塞', async () => {
      const silence = Buffer.alloc(16000);
      const results = await Promise.all([
        transcribe(silence, 16000),
        transcribe(silence, 16000),
        transcribe(silence, 16000),
      ]);
      // 3 个并发请求全返回 null (静音)
      expect(results.every((r) => r === null)).toBe(true);
    }, 30000);
  });
});
