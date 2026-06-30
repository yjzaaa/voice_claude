import React from 'react';

export interface StatusButtonProps {
  recording: boolean;
  onClick: () => void;
}

export const StatusButton: React.FC<StatusButtonProps> = ({ recording, onClick }) => {
  return (
    <button
      onClick={onClick}
      style={{
        marginTop: 10,
        padding: '8px 20px',
        border: 'none',
        borderRadius: 8,
        background: recording ? '#e94560' : '#00e676',
        color: recording ? '#fff' : '#000',
        fontSize: '0.95em',
        cursor: 'pointer',
        outline: 'none',
      }}
    >
      {recording ? '停止录音' : '开始录音'}
    </button>
  );
};
