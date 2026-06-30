import { test, expect, _electron as electron } from '@playwright/test';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const ELECTRON_EXECUTABLE = path.join(PROJECT_ROOT, 'node_modules', '.bin', 'electron.cmd');
const MAIN_ENTRY = path.join(PROJECT_ROOT, 'dist', 'main-agent.js');

test.describe.configure({ mode: 'serial' });

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
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('networkidle');
    await window.setViewportSize({ width: 320, height: 220 });
    await window.bringToFront();

    const screenshotPath = path.join(PROJECT_ROOT, 'logs', 'smoke-status.png');
    await window.screenshot({ path: screenshotPath });

    const bodyText = await window.locator('body').textContent();
    expect(bodyText).toContain('voice_claude');
    expect(bodyText).toContain('就绪');
  });

  test('gear button opens settings page', async () => {
    const window = await electronApp.firstWindow();
    await window.setViewportSize({ width: 320, height: 220 });
    await window.bringToFront();
    await window.getByLabel('设置').click();

    await expect(window.getByRole('heading', { name: '设置', exact: true })).toBeVisible();
    await expect(window.getByText('偏好设置')).toBeVisible();
    await expect(window.getByText('高风险工具白名单')).toBeVisible();

    const screenshotPath = path.join(PROJECT_ROOT, 'logs', 'smoke-settings.png');
    await window.screenshot({ path: screenshotPath });
  });

  test('back button returns to status page', async () => {
    const window = await electronApp.firstWindow();
    await window.getByText('← 返回').click();

    await expect(window.getByText('voice_claude')).toBeVisible();
    await expect(window.getByText('设置')).not.toBeVisible();
  });

  test('no uncaught exceptions or console errors', async () => {
    const window = await electronApp.firstWindow();
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
