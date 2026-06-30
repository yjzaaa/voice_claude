import React from 'react';

export interface StatusIconProps {
  recording: boolean;
}

export const StatusIcon: React.FC<StatusIconProps> = ({ recording }) => {
  return (
    <div
      style={{
        fontSize: '2.5em',
        marginBottom: 6,
        marginTop: 14,
        transition: 'transform 0.2s',
        color: recording ? '#e94560' : '#e0e0e0',
      }}
    >
      🎤
    </div>
  );
};
