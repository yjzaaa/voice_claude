/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { DebugPanel } from '../../../../../src/renderer/status/components/DebugPanel';

describe('DebugPanel', () => {
  test('shows recording hint when recording', () => {
    render(<DebugPanel recording />);
    expect(screen.getByText('正在听，请说话（静音1.5秒自动结束）')).toBeInTheDocument();
  });

  test('shows empty when not recording', () => {
    const { container } = render(<DebugPanel recording={false} />);
    expect(container.firstChild).toHaveTextContent('');
  });
});
