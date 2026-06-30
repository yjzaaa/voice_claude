/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { PermissionRequest } from '../../../../src/renderer/status/PermissionRequest';
import * as hook from '../../../../src/renderer/status/hooks/usePermissionRequests';

describe('PermissionRequest', () => {
  const usePermissionRequestsSpy = jest.spyOn(hook, 'usePermissionRequests');

  afterEach(() => {
    usePermissionRequestsSpy.mockReset();
  });

  const makeRequest = (overrides?: Partial<hook.PermissionRequest>) => ({
    requestId: 'r1',
    text: '打开记事本并输入内容',
    plan: { goal: '打开记事本', steps: [{ tool: 'typeText' }] },
    tools: ['typeText', 'pressKey'],
    ...overrides,
  });

  test('renders nothing when no request', () => {
    usePermissionRequestsSpy.mockReturnValue({ current: null, respond: jest.fn() });
    const { container } = render(<PermissionRequest />);
    expect(container.firstChild).toBeNull();
  });

  test('shows request details', () => {
    usePermissionRequestsSpy.mockReturnValue({ current: makeRequest(), respond: jest.fn() });
    render(<PermissionRequest />);

    expect(screen.getByTestId('permission-request')).toBeInTheDocument();
    expect(screen.getByTestId('permission-text')).toHaveTextContent('打开记事本并输入内容');
    expect(screen.getByTestId('permission-goal')).toHaveTextContent('打开记事本');
    expect(screen.getByTestId('permission-tools')).toHaveTextContent('typeText');
    expect(screen.getByTestId('permission-tools')).toHaveTextContent('pressKey');
  });

  test('deny button responds with allow=false, remember=false', () => {
    const respond = jest.fn();
    usePermissionRequestsSpy.mockReturnValue({ current: makeRequest(), respond });
    render(<PermissionRequest />);

    fireEvent.click(screen.getByTestId('permission-deny'));
    expect(respond).toHaveBeenCalledWith(false, false);
  });

  test('allow once button responds with allow=true, remember=false', () => {
    const respond = jest.fn();
    usePermissionRequestsSpy.mockReturnValue({ current: makeRequest(), respond });
    render(<PermissionRequest />);

    fireEvent.click(screen.getByTestId('permission-allow-once'));
    expect(respond).toHaveBeenCalledWith(true, false);
  });

  test('allow always button responds with allow=true, remember=true', () => {
    const respond = jest.fn();
    usePermissionRequestsSpy.mockReturnValue({ current: makeRequest(), respond });
    render(<PermissionRequest />);

    fireEvent.click(screen.getByTestId('permission-allow-always'));
    expect(respond).toHaveBeenCalledWith(true, true);
  });
});
