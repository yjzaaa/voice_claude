/**
 * 开发模式 — 全量文件监控 + 自动重载
 * 监控: src/*.ts, *.html, *.py, *.json
 * 变化 → kill Chrome + Electron → tsc → 重启
 */
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const WATCH_DIRS = ['src', '.'];
const WATCH_EXTS = ['.ts', '.html', '.py', '.json'];
const IGNORE = ['node_modules', 'dist', 'logs', '.git', 'voice.log'];

let electron = null;
let restartTimer = null;

function restart() {
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    console.log('\n🔄 文件变化，重启...\n');
    try { execSync('taskkill /f /im electron.exe /im chrome.exe 2>nul', { stdio: 'ignore' }); } catch {}
    if (electron) { electron.kill(); electron = null; }
    try {
      execSync('npx -p typescript tsc', { stdio: 'inherit', cwd: __dirname });
    } catch (e) {
      console.error('❌ 编译失败，等待修正...');
      return;
    }
    electron = spawn('npx', ['electron', '.'], { stdio: 'inherit', shell: true, cwd: __dirname });
    electron.on('close', () => { electron = null; });
  }, 500); // 500ms 防抖
}

function watch(dir) {
  const abs = path.join(__dirname, dir);
  if (!fs.existsSync(abs)) return;
  fs.watch(abs, { recursive: true }, (event, filename) => {
    if (!filename) return;
    const ext = path.extname(filename);
    if (WATCH_EXTS.includes(ext) && !IGNORE.some(i => filename.includes(i))) {
      console.log(`  📝 ${filename}`);
      restart();
    }
  });
}

function start() {
  // 初始编译
  try {
    execSync('npx -p typescript tsc', { stdio: 'inherit', cwd: __dirname });
  } catch (e) {
    console.error('❌ 初始编译失败');
    process.exit(1);
  }

  // 启动
  electron = spawn('npx', ['electron', '.'], { stdio: 'inherit', shell: true, cwd: __dirname });
  electron.on('close', () => process.exit(0));

  // 监控
  for (const dir of WATCH_DIRS) watch(dir);
  console.log('👀 开发模式 — 监控中 (Ctrl+C 退出)\n');
}

process.on('SIGINT', () => {
  if (electron) electron.kill();
  process.exit(0);
});

start();
