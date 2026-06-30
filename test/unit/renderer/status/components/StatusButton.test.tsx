/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { StatusButton } from '../../../../../src/renderer/status/components/StatusButton';

describe('StatusButton', () => {
  test('shows start text when not recording', () => {
    render(<StatusButton recording={false} onClick={jest.fn()} />);
    expect(screen.getByRole('button')).toHaveTextContent('开始录音');
  });

  test('shows stop text when recording', () => {
    render(<StatusButton recording onClick={jest.fn()} />);
    expect(screen.getByRole('button')).toHaveTextContent('停止录音');
  });

  test('calls onClick when clicked', () => {
    const onClick = jest.fn();
    render(<StatusButton recording={false} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
