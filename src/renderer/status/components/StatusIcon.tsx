import React from 'react';
import styles from './StatusIcon.module.css';

export interface StatusIconProps {
  recording: boolean;
}

export const StatusIcon: React.FC<StatusIconProps> = ({ recording }) => {
  return (
    <div
      className={[styles.icon, recording ? styles.recording : ''].join(' ')}
      data-testid="status-icon"
      aria-label={recording ? '录音中' : '就绪'}
      role="img"
    >
      🎤
    </div>
  );
};

export default StatusIcon;
