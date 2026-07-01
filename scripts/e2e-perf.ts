/**
 * E2E performance benchmark for voice_claude.
 *
 * Launches the Electron app, measures startup latency, and simulates an
 * ASR -> planning -> acting -> success pipeline by emitting the same events
 * the main process sends to the status window. Results are appended to
 * logs/e2e-perf.jsonl as JSON lines.
 *
 * Run with: npm run test:e2e:perf
 */

import { _electron as electron } from 'playwright-core';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

const ROOT = path.resolve(__dirname, '..');
const ELECTRON_EXECUTABLE =
  process.platform === 'win32'
    ? path.join(ROOT, 'node_modules', '.bin', 'electron.cmd')
    : path.join(ROOT, 'node_modules', '.bin', 'electron');
const MAIN_ENTRY = path.join(ROOT, 'dist', 'main-agent.js');
const PERF_LOG = path.join(ROOT, 'logs', 'e2e-perf.jsonl');

interface PerfEntry {
  runId: string;
  timestamp: number;
  phase: string;
  [metric: string]: number | string | undefined;
}

function writePerf(entry: PerfEntry) {
  fs.mkdirSync(path.dirname(PERF_LOG), { recursive: true });
  fs.appendFileSync(PERF_LOG, JSON.stringify(entry) + '\n');
}

async function findStatusWindow(app: Awaited<ReturnType<typeof electron.launch>>) {
  for (let i = 0; i < 50; i += 1) {
    const windows = app.windows();
    const statusWindow = windows.find((w) => w.url().includes('status.html'));
    if (statusWindow) return statusWindow;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('status window not found');
}

async function sendAgentEvent(
  app: Awaited<ReturnType<typeof electron.launch>>,
  event: string,
  payload?: Record<string, unknown>,
) {
  await app.evaluate(
    ({ BrowserWindow }, { eventName, eventPayload }) => {
      const wins = BrowserWindow.getAllWindows();
      const statusWin = wins.find((w) => w.webContents.getURL().includes('status.html'));
      if (statusWin) {
        statusWin.webContents.send(`agent:${eventName}`, eventPayload);
      }
    },
    { eventName: event, eventPayload: payload },
  );
}

async function main() {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-claude-perf-'));

  const launchStart = Date.now();
  const app = await electron.launch({
    executablePath: ELECTRON_EXECUTABLE,
    args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`],
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: 'test' },
  });
  const launchEnd = Date.now();

  try {
    const window = await findStatusWindow(app);
    await window.waitForLoadState('networkidle');
    await window.waitForSelector('text=就绪', { timeout: 30000 });
    const readyEnd = Date.now();

    writePerf({
      runId,
      timestamp: launchStart,
      phase: 'startup',
      launchMs: launchEnd - launchStart,
      readyMs: readyEnd - launchStart,
    });

    // Simulated ASR pipeline: transcribing -> planning -> acting -> success.
    const pipelineStart = Date.now();

    await sendAgentEvent(app, 'transcribing');
    await window.waitForSelector('text=识别中', { timeout: 5000 });
    const transcribingEnd = Date.now();

    const transcript = '关闭当前窗口';
    await sendAgentEvent(app, 'planning', { text: transcript });
    await window.waitForSelector('text=规划中', { timeout: 5000 });
    const planningEnd = Date.now();

    const plan = {
      goal: '关闭当前窗口',
      steps: [{ tool: 'close_window', risk: 'high', reason: '关闭活动窗口' }],
      canAutoExecute: false,
    };
    await sendAgentEvent(app, 'acting', { plan });
    await window.waitForSelector('text=执行中', { timeout: 5000 });
    const actingEnd = Date.now();

    await sendAgentEvent(app, 'success', { text: transcript, plan });
    await window.waitForSelector('text=完成', { timeout: 5000 });
    const successEnd = Date.now();

    writePerf({
      runId,
      timestamp: pipelineStart,
      phase: 'asr_pipeline',
      totalMs: successEnd - pipelineStart,
      transcribingMs: transcribingEnd - pipelineStart,
      planningMs: planningEnd - transcribingEnd,
      actingMs: actingEnd - planningEnd,
      executionMs: successEnd - actingEnd,
    });

    console.log('perf benchmark complete:', PERF_LOG);
  } finally {
    await app.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('perf benchmark failed', err);
    process.exit(1);
  });
