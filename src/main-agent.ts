/**
 * voice_claude — Agent 模式 Electron 入口
 *
 * 使用 composition-root 装配的 VoiceAgent 替代旧的 deliver() 管线。
 * 录音仍由隐藏窗口的 Web Audio + VAD 处理，每段语音结束后交给 agent 规划/执行。
 */

import { app, BrowserWindow, Tray, screen, nativeImage, ipcMain, dialog } from 'electron';
import * as path from 'path';
import { createApp } from './composition-root';
import { initRecorder, startRecording, stopRecording, isRecorderRecording } from './asr/recorder';
import { installGlobalExceptionHandlers } from './infrastructure/errors/GlobalExceptionHandler';

const isDev = !app.isPackaged;

function icon(c: string) {
  return nativeImage.createFromDataURL(
    `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="7" fill="${c}"/></svg>`)}`,
  );
}

function statusUrl(): string {
  return isDev
    ? 'http://localhost:5173/status.html'
    : path.join(__dirname, 'renderer', 'status.html');
}

async function main(): Promise<void> {
  const services = createApp();
  const {
    eventBus,
    voiceAgent,
    logger,
    windowRepository,
    scheduler,
    memoryStore,
    riskClassifier,
    planExecutor,
    auditLogger,
  } = services;

  // 全局异常兜底：记录并安全退出
  installGlobalExceptionHandlers(logger, app);

  // 立即扫描一次窗口，让 agent 拥有初始上下文
  windowRepository.scan();

  let win: BrowserWindow | null = null;
  let tray: Tray | null = null;
  let isQuitting = false;

  app.on('before-quit', () => {
    isQuitting = true;
    scheduler.stop();
    logger.destroy();
  });

  // 状态窗口
  function createStatusWindow(): BrowserWindow {
    const w = new BrowserWindow({
      width: 320,
      height: 220,
      x: screen.getPrimaryDisplay().workAreaSize.width - 340,
      y: screen.getPrimaryDisplay().workAreaSize.height - 240,
      frame: false,
      transparent: true,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    const url = statusUrl();
    const fallbackUrl = path.join(__dirname, 'renderer', 'status.html');
    if (url.startsWith('http')) {
      w.loadURL(url);
      // 开发服务器未启动时自动回退到已构建的静态文件
      w.webContents.on('did-fail-load', (_event, errorCode, _errorDescription, validatedURL) => {
        if (validatedURL === url && errorCode !== -3) {
          logger.warn('status', 'dev server unavailable, fallback to built file', { url });
          w.loadFile(fallbackUrl);
        }
      });
    } else {
      w.loadFile(url);
    }

    w.on('close', (e) => {
      if (!isQuitting) {
        e.preventDefault();
        w.hide();
      }
    });

    return w;
  }

  // 把 agent 生命周期事件转发到状态窗口
  const agentEvents = [
    'agent:transcribing',
    'agent:planning',
    'agent:acting',
    'agent:success',
    'agent:ignored',
    'agent:needs-human',
    'agent:step-failed',
    'agent:plan-failed',
  ];
  for (const ev of agentEvents) {
    eventBus.on(ev, (payload) => {
      win?.webContents.send(ev, payload);
    });
  }

  // 录音状态变更时同步托盘图标
  function updateTray(recording: boolean): void {
    if (!tray) return;
    tray.setImage(icon(recording ? '#e94560' : '#00e676'));
    tray.setToolTip(recording ? 'voice_claude - 监听中，点击停止' : 'voice_claude - 点击开始监听');
  }

  app.whenReady().then(() => {
    logger.info('app', 'ready');
    win = createStatusWindow();

    // 高风险工具权限请求：弹出系统对话框让用户选择拒绝 / 允许一次 / 始终允许
    eventBus.on('agent:permission-request', async (payload: any) => {
      const { text, plan, tools } = payload as {
        text: string;
        plan: { goal: string; steps: any[] };
        tools: string[];
      };
      logger.warn('permission', 'requesting user consent', { tools, goal: plan.goal });

      const { response } = await dialog.showMessageBox(win!, {
        type: 'question',
        buttons: ['拒绝', '允许一次', '始终允许'],
        defaultId: 0,
        title: 'voice_claude 请求权限',
        message: `请求执行高风险操作：${tools.join('、')}`,
        detail: `目标：${plan.goal}\n语音：${text}`,
      });

      if (response === 0) {
        logger.warn('permission', 'denied', { tools });
        return;
      }

      const allowAlways = response === 2;
      let whitelist: string[] = [];
      if (allowAlways) {
        const current = (await memoryStore.get<string[]>('riskWhitelist')) ?? [];
        whitelist = Array.from(new Set([...current, ...tools]));
        await memoryStore.set('riskWhitelist', whitelist);
        logger.info('permission', 'whitelist updated', { whitelist });
      } else {
        whitelist = tools;
      }

      const reclassified = riskClassifier.classify(plan, whitelist);
      const result = await planExecutor.execute(reclassified);

      if (result.status === 'success') {
        eventBus.emit('agent:success', { text, plan: reclassified });
      } else {
        eventBus.emit('agent:step-failed', { text, plan: reclassified, result });
      }

      auditLogger.log({
        timestamp: Date.now(),
        triggerText: text,
        response: {
          isCommand: true,
          confidence: 1,
          plan,
          reason: `permission ${allowAlways ? 'always' : 'once'}`,
        },
        executionResult: {
          status: result.status,
          failedStep: result.failedStep,
          error: result.error instanceof Error ? result.error.message : undefined,
        },
      });
    });

    tray = new Tray(icon('#00e676'));
    tray.setToolTip('voice_claude - 点击切换监听');
    tray.on('click', () => {
      if (isRecorderRecording()) {
        stopRecording();
      } else {
        startRecording();
      }
    });

    // 状态窗口按钮切换监听
    ipcMain.on('status:toggle', () => {
      if (isRecorderRecording()) {
        stopRecording();
      } else {
        startRecording();
      }
    });

    // 渲染进程日志桥
    ipcMain.on('renderer:log', (_event, level: string, cmp: string, msg: string, extra?: any) => {
      if (level === 'error') logger.error(cmp, msg, extra);
      else if (level === 'warn') logger.warn(cmp, msg, extra);
      else logger.info(cmp, msg, extra);
    });

    // 初始化录音器：VAD 自动分段，每段交给 agent
    initRecorder({
      onPcm: async (pcm: Buffer) => {
        logger.info('recorder', 'pcm segment', { bytes: pcm.length });
        try {
          await voiceAgent.onPcm(pcm);
        } catch (err: any) {
          logger.error('voiceAgent', 'onPcm failed', { error: err.message });
        }
        // 短暂停顿后继续监听下一段语音
        setTimeout(() => {
          if (!isQuitting) startRecording();
        }, 300);
      },
      onStateChange: (recording: boolean) => {
        logger.info('recorder', 'state', { recording });
        win?.webContents.send('status:state', recording);
        updateTray(recording);
      },
    });

    win.show();

    // 启动窗口扫描调度
    scheduler.start();

    // 启动连续监听
    setTimeout(() => startRecording(), 1000);
  });

  app.on('window-all-closed', () => {});
}

if (!app.requestSingleInstanceLock()) {
  process.exit(0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('main-agent failed', err);
  process.exit(1);
});
