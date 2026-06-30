import React from 'react';
import { useAgentState } from '../hooks/useAgentState';

export const AgentStatus: React.FC = () => {
  const { status } = useAgentState();

  return (
    <div
      data-testid="agent-status"
      style={{
        marginTop: 8,
        fontSize: '0.85em',
        color: '#00e676',
        minHeight: '1.2em',
      }}
    >
      {status}
    </div>
  );
};
