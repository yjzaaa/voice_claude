import { useCallback, useEffect, useState } from 'react';
import { getStatusAPI } from '../../shared/api';

export interface UseRecordingStateResult {
  recording: boolean;
  ready: boolean;
  error: string | null;
  toggle: () => void;
}

export function useRecordingState(): UseRecordingStateResult {
  const statusAPI = getStatusAPI();
  const [recording, setRecording] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(statusAPI ? null : 'IPC 未连接');

  useEffect(() => {
    if (!statusAPI) return;
    statusAPI.onStateChange(setRecording);
    statusAPI.onRecorderReadyStateChange(setReady);
    return () => {
      getStatusAPI()?.removeAllListeners();
    };
  }, [statusAPI]);

  const toggle = useCallback(() => {
    const api = getStatusAPI();
    if (!api) {
      setError('IPC 未连接');
      return;
    }
    if (!ready) {
      setError('录音器未就绪');
      return;
    }
    try {
      api.toggle();
      setError(null);
    } catch (err: any) {
      setError(err.message);
    }
  }, [ready]);

  return { recording, ready, error, toggle };
}
