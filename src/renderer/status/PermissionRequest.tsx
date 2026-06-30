import React from 'react';
import { usePermissionRequests } from './hooks/usePermissionRequests';
import styles from './PermissionRequest.module.css';

export const PermissionRequest: React.FC = () => {
  const { current, respond } = usePermissionRequests();

  if (!current) return null;

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      data-testid="permission-request"
    >
      <div className={styles.card}>
        <h3 className={styles.title}>高风险操作请求</h3>
        <p className={styles.section} data-testid="permission-text">
          <span className={styles.label}>语音原文：</span>
          {current.text}
        </p>
        <p className={styles.section} data-testid="permission-goal">
          <span className={styles.label}>目标：</span>
          {current.plan.goal}
        </p>
        <div className={styles.section} data-testid="permission-tools">
          <span className={styles.label}>涉及工具：</span>
          <ul className={styles.toolList}>
            {current.tools.map((tool) => (
              <li key={tool} className={styles.toolItem}>
                {tool}
              </li>
            ))}
          </ul>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={[styles.button, styles.deny].join(' ')}
            onClick={() => respond(false, false)}
            data-testid="permission-deny"
          >
            拒绝
          </button>
          <button
            type="button"
            className={[styles.button, styles.allowOnce].join(' ')}
            onClick={() => respond(true, false)}
            data-testid="permission-allow-once"
          >
            允许一次
          </button>
          <button
            type="button"
            className={[styles.button, styles.allowAlways].join(' ')}
            onClick={() => respond(true, true)}
            data-testid="permission-allow-always"
          >
            始终允许
          </button>
        </div>
      </div>
    </div>
  );
};

export default PermissionRequest;
