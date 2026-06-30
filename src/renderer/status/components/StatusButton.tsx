import React from 'react';
import styles from './StatusButton.module.css';

export interface StatusButtonProps {
  recording: boolean;
  onClick: () => void;
}

export const StatusButton: React.FC<StatusButtonProps> = ({ recording, onClick }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[styles.button, recording ? styles.recording : ''].join(' ')}
      data-testid="status-button"
    >
      {recording ? '停止录音' : '开始录音'}
    </button>
  );
};

export default StatusButton;
