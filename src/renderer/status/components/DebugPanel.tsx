import React from 'react';
import { useAgentState, formatDuration } from '../hooks/useAgentState';
import styles from './DebugPanel.module.css';

export interface DebugPanelProps {
  recording: boolean;
}

const RISK_LABELS: Record<NonNullable<ReturnType<typeof useAgentState>['riskLevel']>, string> = {
  low: '低',
  medium: '中',
  high: '高',
  critical: '极高',
};

const RISK_CLASS: Record<keyof typeof RISK_LABELS, string> = {
  low: styles.riskLow,
  medium: styles.riskMedium,
  high: styles.riskHigh,
  critical: styles.riskCritical,
};

export const DebugPanel: React.FC<DebugPanelProps> = ({ recording }) => {
  const { lastTranscript, planGoal, riskLevel, executionDuration, lastError } = useAgentState();

  if (!recording && !lastTranscript && !planGoal && !lastError) {
    return (
      <div className={styles.panel} data-testid="debug-panel">
        <div className={styles.hint}>等待语音输入...</div>
      </div>
    );
  }

  return (
    <div className={styles.panel} data-testid="debug-panel">
      {recording && (
        <div className={styles.row}>
          <span className={styles.label}>状态</span>
          <span className={styles.value}>正在听，请说话（静音1.5秒自动结束）</span>
        </div>
      )}
      {lastTranscript && (
        <div className={styles.row}>
          <span className={styles.label}>识别</span>
          <span className={styles.value} data-testid="debug-transcript">
            {lastTranscript}
          </span>
        </div>
      )}
      {planGoal && (
        <div className={styles.row}>
          <span className={styles.label}>目标</span>
          <span className={styles.value} data-testid="debug-goal">
            {planGoal}
          </span>
        </div>
      )}
      {riskLevel && (
        <div className={styles.row}>
          <span className={styles.label}>风险</span>
          <span
            className={[styles.value, RISK_CLASS[riskLevel]].join(' ')}
            data-testid="debug-risk"
          >
            {RISK_LABELS[riskLevel]}
          </span>
        </div>
      )}
      {executionDuration > 0 && (
        <div className={styles.row}>
          <span className={styles.label}>耗时</span>
          <span className={styles.value} data-testid="debug-duration">
            {formatDuration(executionDuration)}
          </span>
        </div>
      )}
      {lastError && (
        <div className={styles.row}>
          <span className={styles.label}>错误</span>
          <span className={[styles.value, styles.riskCritical].join(' ')} data-testid="debug-error">
            {lastError}
          </span>
        </div>
      )}
    </div>
  );
};

export default DebugPanel;
