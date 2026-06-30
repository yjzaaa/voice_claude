import React from 'react';

export interface DebugPanelProps {
  recording: boolean;
}

export const DebugPanel: React.FC<DebugPanelProps> = ({ recording }) => {
  return (
    <div
      style={{
        fontSize: '0.65em',
        color: '#888',
        marginTop: 8,
        maxWidth: 280,
        textAlign: 'center',
        minHeight: '1.2em',
      }}
    >
      {recording ? '正在听，请说话（静音1.5秒自动结束）' : ''}
    </div>
  );
};
