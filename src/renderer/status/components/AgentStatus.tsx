import React from 'react';
import { useAgentState, type AgentStep } from '../hooks/useAgentState';
import styles from './AgentStatus.module.css';

const STEPS: { id: AgentStep; label: string }[] = [
  { id: 'transcribing', label: '识别中' },
  { id: 'planning', label: '规划中' },
  { id: 'acting', label: '执行中' },
];

function isStepCompleted(current: AgentStep, step: AgentStep): boolean {
  if (step === 'transcribing') return current !== 'idle' && current !== 'transcribing';
  if (step === 'planning')
    return (
      current === 'acting' ||
      current === 'completed' ||
      current === 'error' ||
      current === 'needs-human'
    );
  if (step === 'acting')
    return current === 'completed' || current === 'error' || current === 'needs-human';
  return false;
}

function isStepActive(current: AgentStep, step: AgentStep): boolean {
  return current === step;
}

function getStatusClass(step: AgentStep): string {
  if (step === 'error') return styles.statusError;
  if (step === 'needs-human') return styles.statusWarning;
  return '';
}

function getStepClass(current: AgentStep, step: AgentStep): string {
  const classes = [styles.step];
  if (isStepActive(current, step)) classes.push(styles.stepActive);
  if (isStepCompleted(current, step)) classes.push(styles.stepCompleted);
  return classes.join(' ');
}

export const AgentStatus: React.FC = () => {
  const { step, status } = useAgentState();

  return (
    <div className={styles.container} data-testid="agent-status">
      <div className={styles.steps}>
        {STEPS.map((s, index) => (
          <React.Fragment key={s.id}>
            <div className={getStepClass(step, s.id)} data-testid={`agent-step-${s.id}`}>
              <span className={styles.dot} />
              <span>{s.label}</span>
            </div>
            {index < STEPS.length - 1 && (
              <div
                className={[
                  styles.connector,
                  isStepCompleted(step, s.id) ? styles.connectorCompleted : '',
                ].join(' ')}
                data-testid={`agent-connector-${index}`}
              />
            )}
          </React.Fragment>
        ))}
      </div>
      <p
        className={[styles.statusLabel, getStatusClass(step)].join(' ')}
        data-testid="agent-status-label"
      >
        {status}
      </p>
    </div>
  );
};

export default AgentStatus;
