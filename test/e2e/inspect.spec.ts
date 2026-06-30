import { test, expect, _electron as electron } from '@playwright/test';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const ELECTRON_EXECUTABLE = path.join(PROJECT_ROOT, 'node_modules', '.bin', 'electron.cmd');
const MAIN_ENTRY = path.join(PROJECT_ROOT, 'dist', 'main-agent.js');

test('inspect renderer window APIs', async () => {
  const electronApp = await electron.launch({
    executablePath: ELECTRON_EXECUTABLE,
    args: [MAIN_ENTRY],
    cwd: PROJECT_ROOT,
    env: { ...process.env, NODE_ENV: 'test' },
  });

  const window = await electronApp.firstWindow();
  await window.waitForLoadState('networkidle');

  // Capture console messages
  const consoleMessages: { type: string; text: string }[] = [];
  electronApp.on('console', (msg) => {
    consoleMessages.push({ type: msg.type(), text: msg.text() });
  });

  const statusAPI = await window.evaluate(() => (window as any).statusAPI !== undefined);
  const settingsAPI = await window.evaluate(() => (window as any).settingsAPI !== undefined);
  const permissionAPI = await window.evaluate(() => (window as any).permissionAPI !== undefined);

  console.log({ statusAPI, settingsAPI, permissionAPI, consoleMessages });

  await electronApp.close();

  expect(statusAPI).toBe(true);
  expect(settingsAPI).toBe(true);
});
