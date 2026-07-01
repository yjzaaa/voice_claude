import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync, spawn } from 'child_process';
import { EventBus, EventPayload } from './application/events/EventBus';
import { FileLogger } from './infrastructure/logging/FileLogger';
import { InMemoryMetrics } from './infrastructure/metrics/InMemoryMetrics';
import { EnvConfigSource } from './adapters/config/EnvConfigSource';
import { FileConfigSource } from './adapters/config/FileConfigSource';
import { AppConfig } from './ports/incoming/ConfigSource';
import { Win32WindowManager } from './adapters/platform/win32/Win32WindowManager';
import { Win32InputSimulator, Win32Input } from './adapters/platform/win32/Win32InputSimulator';
import { Win32Clipboard } from './adapters/platform/win32/Win32Clipboard';
import { Win32ProcessLauncher } from './adapters/platform/win32/Win32ProcessLauncher';
import { WindowManager } from './ports/incoming/WindowManager';
import { InputSimulator } from './ports/incoming/InputSimulator';
import { Clipboard } from './ports/incoming/Clipboard';
import { ProcessLauncher } from './ports/incoming/ProcessLauncher';
import { createLlmClient } from './adapters/llm/LlmClientFactory';
import { LlmClient } from './ports/incoming/LlmClient';
import { AsrEngine } from './ports/incoming/AsrEngine';
import { DoubaoAsrEngine } from './adapters/asr/DoubaoAsrEngine';
import { VoskAsrEngine } from './adapters/asr/VoskAsrEngine';
import { CompositeAsrEngine } from './adapters/asr/CompositeAsrEngine';
import { ToolRegistry } from './domain/services/ToolRegistry';
import {
  createSendTextTool,
  createFocusWindowTool,
  createCloseWindowTool,
  createGetWindowListTool,
  createGetActiveWindowTool,
  createLaunchProcessTool,
  createSetClipboardTool,
} from './application/tools/builtInTools';
import { RiskClassifier } from './domain/services/RiskClassifier';
import { PlanExecutor } from './domain/services/PlanExecutor';
import { AgentPlanner } from './domain/services/AgentPlanner';
import { VoiceAgent } from './application/agent/VoiceAgent';
import { MemoryStore } from './ports/outgoing/MemoryStore';
import { JsonFileMemoryStore } from './infrastructure/persistence/JsonFileMemoryStore';
import { AuditLogger } from './ports/outgoing/AuditLogger';
import { FileAuditLogger } from './infrastructure/audit/FileAuditLogger';
import { SkillRegistry } from './domain/services/SkillRegistry';
import { syncDefaultSkills } from './infrastructure/skills/syncDefaultSkills';
import { WindowRepository } from './domain/repositories/WindowRepository';
import { AgentPlannerContext } from './domain/services/AgentPlanner';
import { CronScheduler } from './infrastructure/scheduler/CronScheduler';

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
  asrEngine: AsrEngine;
  toolRegistry: ToolRegistry;
  skillRegistry: SkillRegistry;
  riskClassifier: RiskClassifier;
  planExecutor: PlanExecutor;
  agentPlanner: AgentPlanner;
  voiceAgent: VoiceAgent;
  scheduler: CronScheduler;
  memoryStore: MemoryStore;
  auditLogger: AuditLogger;
  windowRepository: WindowRepository;
}

function loadKeybdEvent() {
  const koffi = require('koffi');
  return koffi
    .load('user32.dll')
    .func('void keybd_event(uchar vk, uchar scan, int flags, size_t extra)');
}

let cachedSendInput: ((inputs: Win32Input[]) => void) | undefined;

function loadSendInput() {
  if (cachedSendInput) return cachedSendInput;

  const koffi = require('koffi');
  const user32 = koffi.load('user32.dll');

  const KEYBDINPUT = koffi.struct('KEYBDINPUT', {
    wVk: 'uint16_t',
    wScan: 'uint16_t',
    dwFlags: 'uint32_t',
    time: 'uint32_t',
    dwExtraInfo: 'uintptr_t',
  });

  const INPUT = koffi.struct('INPUT', {
    type: 'uint32_t',
    u: koffi.union({ ki: KEYBDINPUT }),
  });

  const SendInput = user32.func(
    'unsigned int __stdcall SendInput(unsigned int cInputs, INPUT *pInputs, int cbSize)',
  );

  cachedSendInput = (inputs: Win32Input[]) => {
    const events = inputs.map((input) => ({
      type: input.type,
      u: {
        ki: {
          wVk: 0,
          wScan: input.ki.wScan,
          dwFlags: input.ki.dwFlags,
          time: 0,
          dwExtraInfo: 0,
        },
      },
    }));
    SendInput(events.length, events, koffi.sizeof(INPUT));
  };

  return cachedSendInput;
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
  const eventBus = new EventBus({
    onError: (event, err) =>
      logger.error('eventBus', 'subscriber threw', {
        event,
        error: err instanceof Error ? err.message : err,
      }),
  });

  const envConfig = new EnvConfigSource().load();
  const fileConfig = new FileConfigSource().load();
  const config: AppConfig = {
    asr: {
      backend: envConfig.asr.backend || fileConfig.asr.backend,
      language: envConfig.asr.language || fileConfig.asr.language,
      sampleRate: envConfig.asr.sampleRate || fileConfig.asr.sampleRate,
      vad: {
        silenceThreshold:
          envConfig.asr.vad?.silenceThreshold ?? fileConfig.asr.vad?.silenceThreshold ?? 500,
        minSpeechDurationMs:
          envConfig.asr.vad?.minSpeechDurationMs ?? fileConfig.asr.vad?.minSpeechDurationMs ?? 400,
        maxSpeechDurationMs:
          envConfig.asr.vad?.maxSpeechDurationMs ??
          fileConfig.asr.vad?.maxSpeechDurationMs ??
          30000,
      },
    },
    llm: {
      apiKey: envConfig.llm.apiKey || fileConfig.llm.apiKey,
      apiUrl: envConfig.llm.apiUrl || fileConfig.llm.apiUrl,
      model: envConfig.llm.model || fileConfig.llm.model,
      timeoutMs: envConfig.llm.timeoutMs ?? fileConfig.llm.timeoutMs,
    },
    routing: { ...fileConfig.routing, ...envConfig.routing },
    doubao: {
      appId: envConfig.doubao.appId || fileConfig.doubao.appId,
      accessToken: envConfig.doubao.accessToken || fileConfig.doubao.accessToken,
      resourceId: envConfig.doubao.resourceId || fileConfig.doubao.resourceId,
      proxyHost: envConfig.doubao.proxyHost || fileConfig.doubao.proxyHost,
      proxyPort: envConfig.doubao.proxyPort ?? fileConfig.doubao.proxyPort,
    },
    windowManager: { ...fileConfig.windowManager, ...envConfig.windowManager },
  };

  const scriptRoot = path.resolve(__dirname, '..');
  const pythonExecutable = process.env.VOICE_CLAUDE_PYTHON_PATH || 'python.exe';

  const windowManager = new Win32WindowManager({
    pythonExecutable,
    scriptRoot,
    execSync,
    spawn,
  });

  const inputSimulator = new Win32InputSimulator(loadKeybdEvent(), blockingSleep, loadSendInput());
  const clipboard = new Win32Clipboard(execSync);
  const processLauncher = new Win32ProcessLauncher(windowManager, spawn, asyncSleep);
  const llmClient = createLlmClient(config.llm);

  // Agent 层装配
  const doubaoEngine = new DoubaoAsrEngine({
    appId: config.doubao.appId,
    accessToken: config.doubao.accessToken,
  });
  const voskEngine = new VoskAsrEngine();
  const asrEngine: AsrEngine = new CompositeAsrEngine([doubaoEngine, voskEngine]);
  const toolRegistry = new ToolRegistry();
  toolRegistry.register(createSendTextTool(inputSimulator));
  toolRegistry.register(createFocusWindowTool(windowManager));
  toolRegistry.register(createCloseWindowTool(windowManager));
  toolRegistry.register(createGetWindowListTool(windowManager));
  toolRegistry.register(createGetActiveWindowTool(windowManager));
  toolRegistry.register(createLaunchProcessTool(processLauncher));
  toolRegistry.register(createSetClipboardTool(clipboard));

  const riskClassifier = new RiskClassifier({
    get_window_list: 'read',
    get_active_window: 'read',
    focus_window: 'low',
    send_text: 'low',
    set_clipboard: 'low',
    launch_process: 'medium',
    close_window: 'high',
  });

  const planExecutor = new PlanExecutor(toolRegistry, 3);

  const projectRoot = process.cwd();
  const defaultsDir = path.join(projectRoot, 'assets', 'skills');
  const userSkillsDir = path.join(os.homedir(), '.voice_claude', 'skills');
  syncDefaultSkills(defaultsDir, userSkillsDir, fs);

  const skillRegistry = new SkillRegistry(userSkillsDir, fs);
  skillRegistry.load();
  const agentPlanner = new AgentPlanner(llmClient, toolRegistry, skillRegistry);

  const windowRepository = new WindowRepository(windowManager, eventBus);

  const scheduler = new CronScheduler();
  scheduler.schedule('*/5 * * * * *', () => windowRepository.scan());

  const memoryStore = new JsonFileMemoryStore(
    path.join(projectRoot, '.voice_claude.memory.json'),
    fs,
  );
  memoryStore.get<string[]>('disabledSkills').then((disabled) => {
    if (disabled) {
      for (const name of disabled) {
        skillRegistry.disable(name);
      }
    }
  });
  const auditLogger = new FileAuditLogger(path.join(projectRoot, 'logs', 'audit.jsonl'), fs);

  const getContext = async (): Promise<AgentPlannerContext> => {
    const [preferences, recentActions, riskWhitelist] = await Promise.all([
      memoryStore.get<Record<string, unknown>>('preferences'),
      memoryStore.get<string[]>('recentActions'),
      memoryStore.get<string[]>('riskWhitelist'),
    ]);
    const windows = windowRepository.getWindows().map((w) => ({
      id: String(w.id),
      title: w.title,
      processName: w.processName,
      appName: w.appName,
      iconPath: w.iconPath,
      role: w.role,
    }));
    const activeId = windowRepository.getActiveWindowId();
    const activeWindow = activeId ? windowRepository.getWindowById(activeId) : undefined;
    return {
      windows,
      activeWindow: activeWindow
        ? {
            id: String(activeWindow.id),
            title: activeWindow.title,
            processName: activeWindow.processName,
            appName: activeWindow.appName,
            iconPath: activeWindow.iconPath,
            role: activeWindow.role,
          }
        : undefined,
      recentActions: recentActions ?? [],
      preferences: preferences ?? {},
      riskWhitelist: riskWhitelist ?? [],
    };
  };

  const recordRecentAction = (summary: string): void => {
    memoryStore
      .get<string[]>('recentActions')
      .then((list) => {
        const next = [summary, ...(list ?? [])].slice(0, 10);
        return memoryStore.set('recentActions', next);
      })
      .catch((err) =>
        logger.error('memory', 'failed to record recent action', { error: err.message }),
      );
  };

  eventBus.on('agent:success', (payload: EventPayload) => {
    const p = payload as { plan: { goal: string } };
    recordRecentAction(`success: ${p.plan.goal}`);
  });
  eventBus.on('agent:step-failed', (payload: EventPayload) => {
    const p = payload as { plan: { goal: string } };
    recordRecentAction(`failed: ${p.plan.goal}`);
  });
  eventBus.on('agent:needs-human', (payload: EventPayload) => {
    const p = payload as { plan: { goal: string } };
    recordRecentAction(`needs-human: ${p.plan.goal}`);
  });

  const voiceAgent = new VoiceAgent(
    asrEngine,
    agentPlanner,
    riskClassifier,
    planExecutor,
    eventBus,
    auditLogger,
    getContext,
    { confidenceThreshold: 0.7 },
  );

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
    asrEngine,
    toolRegistry,
    skillRegistry,
    riskClassifier,
    planExecutor,
    agentPlanner,
    voiceAgent,
    scheduler,
    memoryStore,
    auditLogger,
    windowRepository,
  };
}
