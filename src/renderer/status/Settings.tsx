import React, { useEffect, useState } from 'react';
import { getSettingsAPI } from '../shared/api';
import styles from './Settings.module.css';

/** 设置页属性。 */
export interface SettingsProps {
  /** 返回状态页。 */
  onClose: () => void;
}

/**
 * 设置页：管理白名单、偏好设置（LLM / ASR）并展示最近动作。
 */
export const Settings: React.FC<SettingsProps> = ({ onClose }) => {
  const api = getSettingsAPI();
  const [preferences, setPreferences] = useState<Record<string, unknown>>({});
  const [whitelist, setWhitelist] = useState<string[]>([]);
  const [recentActions, setRecentActions] = useState<string[]>([]);
  const [newTool, setNewTool] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!api) {
      setError('IPC 未连接');
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [prefs, list, actions] = await Promise.all([
        api.getPreferences(),
        api.getRiskWhitelist(),
        api.getRecentActions(),
      ]);
      setPreferences(prefs);
      setWhitelist(list);
      setRecentActions(actions);
      setError(null);
    } catch (err: any) {
      setError(err.message ?? '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const updatePreference = (path: string, value: string) => {
    setPreferences((prev) => {
      const next = { ...prev };
      setValueAtPath(next, path, value);
      return next;
    });
  };

  const savePreferences = async () => {
    if (!api) return;
    setSaving(true);
    try {
      await api.setPreferences(preferences);
    } catch (err: any) {
      setError(err.message ?? '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const addTool = async () => {
    const tool = newTool.trim();
    if (!tool || !api) return;
    await api.addRiskWhitelist(tool);
    setNewTool('');
    await load();
  };

  const removeTool = async (tool: string) => {
    if (!api) return;
    await api.removeRiskWhitelist(tool);
    await load();
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <p className={styles.loading}>加载中...</p>
      </div>
    );
  }

  if (error && whitelist.length === 0 && Object.keys(preferences).length === 0) {
    return (
      <div className={styles.container}>
        <p className={styles.error}>❌ {error}</p>
        <button onClick={load}>重试</button>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button className={styles.backButton} onClick={onClose}>
          ← 返回
        </button>
        <h2 className={styles.title}>设置</h2>
      </div>

      <section className={styles.section}>
        <h3>偏好设置</h3>
        <label className={styles.field}>
          <span>LLM API Key</span>
          <input
            type="password"
            value={String(getValueAtPath(preferences, 'llm.apiKey') ?? '')}
            onChange={(e) => updatePreference('llm.apiKey', e.target.value)}
            placeholder="sk-..."
          />
        </label>
        <label className={styles.field}>
          <span>ASR 后端</span>
          <input
            type="text"
            value={String(getValueAtPath(preferences, 'asr.backend') ?? '')}
            onChange={(e) => updatePreference('asr.backend', e.target.value)}
            placeholder="google_stt"
          />
        </label>
        <button className={styles.saveButton} onClick={savePreferences} disabled={saving}>
          {saving ? '保存中...' : '保存偏好'}
        </button>
      </section>

      <section className={styles.section}>
        <h3>高风险工具白名单</h3>
        <div className={styles.whitelistInput}>
          <input
            type="text"
            value={newTool}
            onChange={(e) => setNewTool(e.target.value)}
            placeholder="输入工具名，按回车添加"
            onKeyDown={(e) => {
              if (e.key === 'Enter') addTool();
            }}
          />
          <button onClick={addTool}>添加</button>
        </div>
        <ul className={styles.list}>
          {whitelist.map((tool) => (
            <li key={tool} className={styles.listItem}>
              <span>{tool}</span>
              <button onClick={() => removeTool(tool)}>删除</button>
            </li>
          ))}
          {whitelist.length === 0 && <li className={styles.empty}>暂无白名单</li>}
        </ul>
      </section>

      <section className={styles.section}>
        <h3>最近动作</h3>
        <ul className={styles.list}>
          {recentActions.map((action, index) => (
            <li key={index} className={styles.listItem}>
              {action}
            </li>
          ))}
          {recentActions.length === 0 && <li className={styles.empty}>暂无记录</li>}
        </ul>
      </section>
    </div>
  );
};

/** 按点分路径读取嵌套值。 */
function getValueAtPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

/** 按点分路径写入嵌套值，必要时创建中间对象。 */
function setValueAtPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.');
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < keys.length - 1; i += 1) {
    const key = keys[i];
    if (!current[key] || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  current[keys[keys.length - 1]] = value;
}
