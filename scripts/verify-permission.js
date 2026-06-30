const path = require('path');
const fs = require('fs');
const { _electron } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..');
const SCREENSHOTS = path.join(ROOT, 'verification-screenshots');

if (!fs.existsSync(SCREENSHOTS)) fs.mkdirSync(SCREENSHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function screenshot(page, name) {
  const file = path.join(SCREENSHOTS, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`[screenshot] ${file}`);
  return file;
}

async function sendTrigger(page) {
  await page.evaluate(() => {
    if (window.statusAPI) window.statusAPI.toggle();
    setTimeout(() => {
      if (window.voiceAPI) window.voiceAPI.send('关闭当前窗口');
    }, 300);
  });
}

async function waitForPermission(page) {
  await page.waitForSelector('[data-testid="permission-request"]', { timeout: 10000 });
  return page.locator('[data-testid="permission-request"]');
}

async function main() {
  console.log('[launch] starting electron...');
  const electronApp = await _electron.launch({
    args: [path.join(ROOT, 'dist', 'main-agent.js')],
    cwd: ROOT,
  });

  try {
    let page = null;
    for (let i = 0; i < 20; i += 1) {
      const candidates = electronApp.windows().filter((w) => w.url().includes('status.html'));
      if (candidates.length > 0) {
        page = candidates[0];
        break;
      }
      await sleep(500);
    }
    if (!page) {
      throw new Error('status window not found');
    }
    await page.waitForLoadState('domcontentloaded');
    await sleep(2000);
    const size = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
    console.log('[status] window size', size);
    await screenshot(page, '01-initial');

    // 1. deny
    console.log('[step] trigger permission and deny');
    await sendTrigger(page);
    const card1 = await waitForPermission(page);
    await screenshot(page, '02-deny-card');
    await page.click('[data-testid="permission-deny"]');
    await page.waitForSelector('[data-testid="permission-request"]', { state: 'detached', timeout: 5000 });
    await screenshot(page, '03-after-deny');

    // 2. allow once
    console.log('[step] trigger permission and allow-once');
    await sleep(500);
    await sendTrigger(page);
    const card2 = await waitForPermission(page);
    await screenshot(page, '04-allow-once-card');
    await page.click('[data-testid="permission-allow-once"]');
    await page.waitForSelector('[data-testid="permission-request"]', { state: 'detached', timeout: 5000 });
    await screenshot(page, '05-after-allow-once');

    // 3. allow always
    console.log('[step] trigger permission and allow-always');
    await sleep(500);
    await sendTrigger(page);
    const card3 = await waitForPermission(page);
    await screenshot(page, '06-allow-always-card');
    await page.click('[data-testid="permission-allow-always"]');
    await page.waitForSelector('[data-testid="permission-request"]', { state: 'detached', timeout: 5000 });
    await sleep(500);
    await screenshot(page, '07-after-allow-always');

    // 4. open settings and verify whitelist
    console.log('[step] open settings to verify whitelist');
    await page.click('button[aria-label="设置"]');
    await page.waitForSelector('text=高风险工具白名单', { timeout: 5000 });
    await screenshot(page, '08-settings-whitelist');

    const whitelistText = await page.locator('text=高风险工具白名单').locator('..').textContent();
    console.log('[whitelist]', whitelistText);

    await electronApp.close();
    console.log('[done] app closed');

    // verify persisted file
    const memPath = path.join(ROOT, '.voice_claude.memory.json');
    const mem = JSON.parse(fs.readFileSync(memPath, 'utf-8'));
    console.log('[memory] riskWhitelist:', mem.riskWhitelist);
    if (!Array.isArray(mem.riskWhitelist) || !mem.riskWhitelist.includes('close_window')) {
      throw new Error('allow-always did not persist close_window to riskWhitelist');
    }
  } catch (err) {
    await electronApp.close().catch(() => {});
    throw err;
  }
}

main()
  .then(() => {
    console.log('verification passed');
    process.exit(0);
  })
  .catch((err) => {
    console.error('verification failed', err);
    process.exit(1);
  });
