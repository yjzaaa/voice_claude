/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { StatusIcon } from '../../../../../src/renderer/status/components/StatusIcon';

describe('StatusIcon', () => {
  test('renders microphone icon', () => {
    render(<StatusIcon recording={false} />);
    expect(screen.getByText('🎤')).toBeInTheDocument();
  });

  test('adds recording class when recording', () => {
    const { container } = render(<StatusIcon recording />);
    expect(container.firstChild).toHaveStyle('color: rgb(233, 69, 96)');
  });
});
