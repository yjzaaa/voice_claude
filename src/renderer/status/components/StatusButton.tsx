import React from 'react';
import styles from './StatusButton.module.css';

export interface StatusButtonProps {
  recording: boolean;
  ready: boolean;
  onClick: () => void;
}

export const StatusButton: React.FC<StatusButtonProps> = ({ recording, ready, onClick }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!ready}
      className={[
        styles.button,
        recording ? styles.recording : '',
        ready ? '' : styles.disabled,
      ].join(' ')}
      data-testid="status-button"
    >
      {!ready ? '录音器未就绪' : recording ? '停止录音' : '开始录音'}
    </button>
  );
};

export default StatusButton;
