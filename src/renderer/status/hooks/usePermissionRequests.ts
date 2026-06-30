import { useCallback, useEffect, useState } from 'react';
import { getPermissionAPI, PermissionRequestPayload } from '../../shared/api';

export interface PermissionRequest extends PermissionRequestPayload {
  requestId: string;
}

export interface UsePermissionRequestsResult {
  /** 当前待处理的权限请求。 */
  current: PermissionRequest | null;
  /** 回复当前请求并移出队列。 */
  respond: (allow: boolean, remember: boolean) => void;
}

/**
 * 订阅主进程的高风险权限请求，维护一个请求队列。
 */
export function usePermissionRequests(): UsePermissionRequestsResult {
  const [queue, setQueue] = useState<PermissionRequest[]>([]);
  const current = queue[0] ?? null;

  useEffect(() => {
    const api = getPermissionAPI();
    if (!api) return undefined;

    const handler = (payload: PermissionRequest) => {
      setQueue((prev) => [...prev, payload]);
    };

    api.onPermissionRequest(handler);
    return () => {
      api.removeAllListeners();
    };
  }, []);

  const respond = useCallback(
    (allow: boolean, remember: boolean) => {
      const api = getPermissionAPI();
      if (!current || !api) return;
      api.respondPermission({ allow, remember, requestId: current.requestId });
      setQueue((prev) => prev.slice(1));
    },
    [current],
  );

  return { current, respond };
}
