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
  return app.firstWindow();
}

test.describe('Settings validation and persistence', () => {
  let electronApp: Awaited<ReturnType<typeof electron.launch>>;
  let userDataDir: string;
  let cwdDir: string;

  test.beforeAll(async () => {
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-claude-settings-'));
    cwdDir = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-claude-settings-cwd-'));
    electronApp = await electron.launch({
      executablePath: ELECTRON_EXECUTABLE,
      args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`],
      cwd: cwdDir,
      env: {
        ...process.env,
        NODE_ENV: 'test',
      },
    });
  });

  test.afterAll(async () => {
    await electronApp.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
    fs.rmSync(cwdDir, { recursive: true, force: true });
  });

  test('validates fields, masks API key and persists preferences', async () => {
    const window = await findStatusWindow(electronApp);
    await window.waitForLoadState('networkidle');
    await window.setViewportSize({ width: 320, height: 500 });

    await window.getByLabel('设置').click();
    await expect(window.getByRole('heading', { name: '设置', exact: true })).toBeVisible();

    // API Key masking toggle
    const keyInput = window.locator('[placeholder="sk-..."]');
    await expect(keyInput).toHaveAttribute('type', 'password');
    await window.getByText('显示').click();
    await expect(keyInput).toHaveAttribute('type', 'text');

    // Fill valid values
    await keyInput.fill('sk-e2e-test-key');
    await window
      .locator('[placeholder="https://api.deepseek.com/v1"]')
      .fill('https://api.example.com/v1');
    await window.getByLabel('ASR 后端').selectOption('composite');

    await expect(window.getByText('保存偏好')).toBeEnabled();
    await window.getByText('保存偏好').click();

    // No validation errors should be visible after save
    await expect(window.locator('text=API Key 不能为空')).not.toBeVisible();
    await expect(window.locator('text=LLM Base URL 必须是有效的 HTTP(S) 地址')).not.toBeVisible();
    await expect(
      window.locator('text=ASR 后端必须是 doubao、vosk、chrome 或 composite 之一'),
    ).not.toBeVisible();

    // Re-open settings and verify persistence
    await window.getByText('← 返回').click();
    await expect(window.getByText('voice_claude')).toBeVisible();

    await window.getByLabel('设置').click();
    await expect(window.getByRole('heading', { name: '设置', exact: true })).toBeVisible();
    await expect(window.locator('[placeholder="sk-..."]')).toHaveValue('sk-e2e-test-key');
    await expect(window.locator('[placeholder="https://api.deepseek.com/v1"]')).toHaveValue(
      'https://api.example.com/v1',
    );
    await expect(window.getByLabel('ASR 后端')).toHaveValue('composite');
  });

  test('disables save and shows Chinese errors for invalid input', async () => {
    const window = await findStatusWindow(electronApp);
    await window.setViewportSize({ width: 320, height: 500 });

    await expect(window.getByRole('heading', { name: '设置', exact: true })).toBeVisible();

    await window.locator('[placeholder="https://api.deepseek.com/v1"]').fill('not-a-url');
    await window.getByLabel('ASR 后端').selectOption('');

    await expect(window.getByText('LLM Base URL 必须是有效的 HTTP(S) 地址')).toBeVisible();
    await expect(
      window.getByText('ASR 后端必须是 doubao、vosk、chrome 或 composite 之一'),
    ).toBeVisible();
    await expect(window.getByText('保存偏好')).toBeDisabled();
  });
});
