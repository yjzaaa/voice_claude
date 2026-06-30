import * as path from 'path';
import { execSync, spawn } from 'child_process';
import { EventBus } from './application/events/EventBus';
import { FileLogger } from './infrastructure/logging/FileLogger';
import { InMemoryMetrics } from './infrastructure/metrics/InMemoryMetrics';
import { EnvConfigSource } from './adapters/config/EnvConfigSource';
import { FileConfigSource } from './adapters/config/FileConfigSource';
import { AppConfig } from './ports/incoming/ConfigSource';
import { Win32WindowManager } from './adapters/platform/win32/Win32WindowManager';
import { Win32InputSimulator } from './adapters/platform/win32/Win32InputSimulator';
import { Win32Clipboard } from './adapters/platform/win32/Win32Clipboard';
import { Win32ProcessLauncher } from './adapters/platform/win32/Win32ProcessLauncher';
import { WindowManager } from './ports/incoming/WindowManager';
import { InputSimulator } from './ports/incoming/InputSimulator';
import { Clipboard } from './ports/incoming/Clipboard';
import { ProcessLauncher } from './ports/incoming/ProcessLauncher';
import { createLlmClient } from './adapters/llm/LlmClientFactory';
import { LlmClient } from './ports/incoming/LlmClient';

export interface AppServices {
  logger: FileLogger;
  metrics: InMemoryMetrics;
  eventBus: EventBus;
  config: AppConfig;
  windowManager: WindowManager;
  inputSimulator: InputSimulator;
  clipboard: Clipboard;
  processLauncher: ProcessLauncher;
  llmClient: LlmClient;
}

function loadKeybdEvent() {
  const koffi = require('koffi');
  return koffi
    .load('user32.dll')
    .func('void keybd_event(uchar vk, uchar scan, int flags, size_t extra)');
}

function blockingSleep(ms: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function asyncSleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export function createApp(): AppServices {
  const logger = new FileLogger();
  const metrics = new InMemoryMetrics();
  const eventBus = new EventBus();

  const envConfig = new EnvConfigSource().load();
  const fileConfig = new FileConfigSource().load();
  const config: AppConfig = {
    asr: { ...fileConfig.asr, ...envConfig.asr },
    llm: { ...fileConfig.llm, ...envConfig.llm },
    routing: { ...fileConfig.routing, ...envConfig.routing },
    doubao: { ...fileConfig.doubao, ...envConfig.doubao },
    windowManager: { ...fileConfig.windowManager, ...envConfig.windowManager },
  };

  const scriptRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const pythonExecutable = process.env.VOICE_CLAUDE_PYTHON_PATH || 'python.exe';

  const windowManager = new Win32WindowManager({
    pythonExecutable,
    scriptRoot,
    execSync,
    spawn,
  });

  const inputSimulator = new Win32InputSimulator(loadKeybdEvent(), blockingSleep);
  const clipboard = new Win32Clipboard(execSync);
  const processLauncher = new Win32ProcessLauncher(windowManager, spawn, asyncSleep);
  const llmClient = createLlmClient(config.llm);

  return {
    logger,
    metrics,
    eventBus,
    config,
    windowManager,
    inputSimulator,
    clipboard,
    processLauncher,
    llmClient,
  };
}
