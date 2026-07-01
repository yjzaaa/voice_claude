/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { StatusButton } from '../../../../../src/renderer/status/components/StatusButton';

describe('StatusButton', () => {
  test('shows start text when not recording', () => {
    render(<StatusButton recording={false} ready onClick={jest.fn()} />);
    expect(screen.getByRole('button')).toHaveTextContent('开始录音');
  });

  test('shows stop text when recording', () => {
    render(<StatusButton recording ready onClick={jest.fn()} />);
    expect(screen.getByRole('button')).toHaveTextContent('停止录音');
  });

  test('shows not ready text when recorder is not ready', () => {
    render(<StatusButton recording={false} ready={false} onClick={jest.fn()} />);
    expect(screen.getByRole('button')).toHaveTextContent('录音器未就绪');
  });

  test('calls onClick when clicked', () => {
    const onClick = jest.fn();
    render(<StatusButton recording={false} ready onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
