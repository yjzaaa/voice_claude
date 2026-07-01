import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';

/**
 * Playwright configuration for voice_claude end-to-end tests.
 *
 * Tests live in test/e2e and launch the Electron app via @playwright/test.
 * Because the app uses a single instance and shared main process state,
 * tests run serially.
 */
export default defineConfig({
  testDir: path.resolve(__dirname, 'test', 'e2e'),
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 60000,
  },
  projects: [
    {
      name: 'electron',
    },
  ],
});
