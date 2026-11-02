import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/api/client';
import { meApi } from '@/api/endpoints';
import type { AccessKey } from '@/api/types';
import { storage, STORAGE_KEYS } from '@/lib/storage';

interface AccessKeyState {
  key: AccessKey | null;
  loading: boolean;
  /** True when the key comes from the device cache because the server could not be reached. */
  offline: boolean;
  error: unknown;
  refresh: () => Promise<void>;
}

/**
 * The QR secret is cached in the secure store so the pass keeps working offline;
 * it is refreshed from GET /api/me/access-key whenever the server is reachable.
 */
export function useAccessKey(): AccessKeyState {
  const [key, setKey] = useState<AccessKey | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const refresh = useCallback(async () => {
    try {
      const fresh = await meApi.accessKey();
      setKey(fresh);
      setOffline(false);
      setError(null);
      await storage.setJSON(STORAGE_KEYS.accessKey, fresh);
    } catch (err) {
      const unreachable = err instanceof ApiError && (err.kind === 'network' || err.kind === 'timeout');
      setOffline(unreachable);
      if (!unreachable) setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    storage.getJSON<AccessKey>(STORAGE_KEYS.accessKey).then((cached) => {
      if (cancelled) return;
      if (cached) {
        setKey(cached);
        setLoading(false);
      }
      refresh();
    });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  return { key, loading, offline, error, refresh };
}
