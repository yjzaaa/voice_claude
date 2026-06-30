import React, { useState } from 'react';
import { StatusIcon } from './components/StatusIcon';
import { StatusButton } from './components/StatusButton';
import { DebugPanel } from './components/DebugPanel';
import { AgentStatus } from './components/AgentStatus';
import { PermissionRequest } from './PermissionRequest';
import { useRecordingState } from './hooks/useRecordingState';
import { Settings } from './Settings';
import styles from './App.module.css';

export const App: React.FC = () => {
  const { recording, error, toggle } = useRecordingState();
  const [view, setView] = useState<'status' | 'settings'>('status');

  if (view === 'settings') {
    return <Settings onClose={() => setView('status')} />;
  }

  return (
    <div className={styles.app}>
      <div className={styles.dragRegion} />
      <button
        className={styles.settingsButton}
        onClick={() => setView('settings')}
        aria-label="设置"
        title="设置"
      >
        ⚙
      </button>
      <StatusIcon recording={recording} />
      <h2 className={styles.title}>voice_claude</h2>
      <p className={[styles.state, error ? styles.stateError : ''].join(' ')}>
        {error ? `❌ ${error}` : recording ? '🔴 录音中...' : '就绪'}
      </p>
      <StatusButton recording={recording} onClick={toggle} />
      <DebugPanel recording={recording} />
      <AgentStatus />
      <PermissionRequest />
    </div>
  );
};

export default App;
