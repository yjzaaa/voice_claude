import { test, expect, _electron as electron } from '@playwright/test';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const ELECTRON_EXECUTABLE = path.join(PROJECT_ROOT, 'node_modules', '.bin', 'electron.cmd');
const MAIN_ENTRY = path.join(PROJECT_ROOT, 'dist', 'main-agent.js');

test.describe.configure({ mode: 'serial' });

test.describe('voice_claude Electron smoke', () => {
  let electronApp: Awaited<ReturnType<typeof electron.launch>>;

  test.beforeAll(async () => {
    electronApp = await electron.launch({
      executablePath: ELECTRON_EXECUTABLE,
      args: [MAIN_ENTRY],
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        NODE_ENV: 'test',
      },
    });
  });

  test.afterAll(async () => {
    await electronApp.close();
  });

  test('status window loads without white screen', async () => {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('networkidle');

    const screenshotPath = path.join(PROJECT_ROOT, 'logs', 'smoke-status.png');
    await window.screenshot({ path: screenshotPath });

    const bodyText = await window.locator('body').textContent();
    expect(bodyText).toContain('voice_claude');
    expect(bodyText).toContain('就绪');
  });

  test('gear button opens settings page', async () => {
    const window = await electronApp.firstWindow();
    await window.getByLabel('设置').click();

    await expect(window.getByText('设置')).toBeVisible();
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
    const errors: string[] = [];
    electronApp.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    const window = await electronApp.firstWindow();
    const [exception] = await Promise.all([
      new Promise<Error | null>((resolve) =>
        electronApp.once('window', (w) => w.on('pageerror', resolve)),
      ),
      window.reload(),
    ]);

    expect(exception).toBeNull();
    expect(errors.filter((e) => !e.includes('source map'))).toHaveLength(0);
  });
});
