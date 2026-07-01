import { test, expect, _electron as electron } from '@playwright/test';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const ELECTRON_EXECUTABLE =
  process.platform === 'win32'
    ? path.join(PROJECT_ROOT, 'node_modules', '.bin', 'electron.cmd')
    : path.join(PROJECT_ROOT, 'node_modules', '.bin', 'electron');
const MAIN_ENTRY = path.join(PROJECT_ROOT, 'dist', 'main-agent.js');

test.describe.configure({ mode: 'serial' });

async function findStatusWindow(app: Awaited<ReturnType<typeof electron.launch>>) {
  const windows = app.windows();
  const statusWindow = windows.find((w) => w.url().includes('status.html'));
  if (statusWindow) return statusWindow;
  // Fall back to first window if the URL hasn't settled yet.
  return app.firstWindow();
}

async function sendStatusState(
  app: Awaited<ReturnType<typeof electron.launch>>,
  recording: boolean,
) {
  await app.evaluate(({ BrowserWindow }, state) => {
    const wins = BrowserWindow.getAllWindows();
    const statusWin = wins.find((w) => w.webContents.getURL().includes('status.html'));
    if (statusWin) {
      statusWin.webContents.send('status:state', state);
    }
  }, recording);
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

test.describe('voice_claude Electron smoke', () => {
  let electronApp: Awaited<ReturnType<typeof electron.launch>>;
  let userDataDir: string;

  test.beforeAll(async () => {
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-claude-smoke-'));
    electronApp = await electron.launch({
      executablePath: ELECTRON_EXECUTABLE,
      args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`],
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        NODE_ENV: 'test',
      },
    });
  });

  test.afterAll(async () => {
    await electronApp.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  });

  test('status window loads without white screen', async () => {
    const window = await findStatusWindow(electronApp);
    await window.waitForLoadState('networkidle');
    await window.setViewportSize({ width: 320, height: 220 });

    const bodyText = await window.locator('body').textContent();
    expect(bodyText).toContain('voice_claude');
    expect(bodyText).toContain('就绪');
  });

  test('gear button opens settings page', async () => {
    const window = await findStatusWindow(electronApp);
    await window.setViewportSize({ width: 320, height: 220 });
    await window.getByLabel('设置').click();

    await expect(window.getByRole('heading', { name: '设置', exact: true })).toBeVisible();
    await expect(window.getByText('偏好设置')).toBeVisible();
    await expect(window.getByText('高风险工具白名单')).toBeVisible();
  });

  test('back button returns to status page', async () => {
    const window = await findStatusWindow(electronApp);
    await window.getByText('← 返回').click();

    await expect(window.getByText('voice_claude')).toBeVisible();
    await expect(window.getByText('设置')).not.toBeVisible();
  });

  test('recording state toggle updates UI', async () => {
    const window = await findStatusWindow(electronApp);
    await window.setViewportSize({ width: 320, height: 220 });

    // Simulate the main process broadcasting that recording has started.
    await sendStatusState(electronApp, true);
    await expect(window.getByTestId('status-icon')).toHaveAttribute('aria-label', '录音中');
    await expect(window.locator('body')).toContainText('录音中...');
    await expect(window.getByTestId('status-button')).toContainText('停止录音');

    // Simulate the main process broadcasting that recording has stopped.
    await sendStatusState(electronApp, false);
    await expect(window.getByTestId('status-icon')).toHaveAttribute('aria-label', '就绪');
    await expect(window.locator('body')).toContainText('就绪');
    await expect(window.getByTestId('status-button')).toContainText('开始录音');
  });

  test('simulated ASR text triggers agent state changes', async () => {
    const window = await findStatusWindow(electronApp);
    await window.setViewportSize({ width: 320, height: 220 });

    await sendAgentEvent(electronApp, 'transcribing');
    await expect(window.getByTestId('agent-step-transcribing')).toHaveClass(/Active/);
    await expect(window.getByTestId('agent-status-label')).toContainText('识别中');

    const transcript = '关闭当前窗口';
    await sendAgentEvent(electronApp, 'planning', { text: transcript });
    await expect(window.getByTestId('agent-step-planning')).toHaveClass(/Active/);
    await expect(window.getByTestId('agent-status-label')).toContainText('规划中');
    await expect(window.getByTestId('debug-transcript')).toContainText(transcript);

    const plan = {
      goal: '关闭当前窗口',
      steps: [{ tool: 'close_window', risk: 'high', reason: '关闭活动窗口' }],
      canAutoExecute: false,
    };
    await sendAgentEvent(electronApp, 'acting', { plan });
    await expect(window.getByTestId('agent-step-acting')).toHaveClass(/Active/);
    await expect(window.getByTestId('agent-status-label')).toContainText('执行中');
    await expect(window.getByTestId('debug-goal')).toContainText(plan.goal);
    await expect(window.getByTestId('debug-risk')).toContainText('高');

    await sendAgentEvent(electronApp, 'success', { text: transcript, plan });
    await expect(window.getByTestId('agent-step-acting')).toHaveClass(/Completed/);
    await expect(window.getByTestId('agent-status-label')).toContainText('完成');
  });

  test('no uncaught exceptions or console errors', async () => {
    const window = await findStatusWindow(electronApp);
    const errors: string[] = [];
    const pageErrors: Error[] = [];

    window.on('pageerror', (err) => pageErrors.push(err));
    electronApp.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await window.reload();
    await window.waitForLoadState('networkidle');

    expect(pageErrors).toHaveLength(0);
    expect(errors.filter((e) => !e.includes('source map'))).toHaveLength(0);
  });
});
