import React from 'react';
import { StatusIcon } from './components/StatusIcon';
import { StatusButton } from './components/StatusButton';
import { DebugPanel } from './components/DebugPanel';
import { AgentStatus } from './components/AgentStatus';
import { useRecordingState } from './hooks/useRecordingState';

export const App: React.FC = () => {
  const { recording, error, toggle } = useRecordingState();

  return (
    <div
      style={{
        fontFamily: 'system-ui, sans-serif',
        background: 'rgba(18,18,36,0.96)',
        color: '#e0e0e0',
        borderRadius: 16,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        flexDirection: 'column',
        userSelect: 'none',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 28,
          ...({ WebkitAppRegion: 'drag' } as any),
        }}
      />
      <StatusIcon recording={recording} />
      <h2 style={{ color: '#888', fontSize: '0.95em' }}>voice_claude</h2>
      <p style={{ color: '#00e676', fontSize: '1.05em', marginTop: 6 }}>
        {error ? `❌ ${error}` : recording ? '🔴 录音中...' : '就绪'}
      </p>
      <StatusButton recording={recording} onClick={toggle} />
      <DebugPanel recording={recording} />
      <AgentStatus />
    </div>
  );
};
