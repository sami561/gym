import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { API_BASE, refreshSession, session } from './client';
import type { AccessLogDto } from './types';

export type LiveStatus = 'connecting' | 'live' | 'offline';

/** Wait before retrying a refresh that failed but kept the session: 2 s, doubling up to 60 s. */
const RETRY_MIN_MS = 2_000;
const RETRY_MAX_MS = 60_000;

/**
 * Staff live feed: Socket.IO namespace /live on the gateway, event `access` (AccessLogDto).
 * Keeps the latest `max` events, newest first.
 */
export function useLiveAccess(onEvent?: (log: AccessLogDto) => void, max = 30) {
  const [events, setEvents] = useState<AccessLogDto[]>([]);
  const [status, setStatus] = useState<LiveStatus>('connecting');
  const handler = useRef(onEvent);

  useEffect(() => {
    handler.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    const socket: Socket = io(`${API_BASE}/live`, {
      transports: ['websocket', 'polling'],
      auth: (cb) => cb({ token: session.getAccessToken() }),
      reconnectionDelayMax: 10_000,
    });
    /** Signed out or unmounted: no more refreshes or reconnections. */
    let stopped = false;
    let retryDelay = RETRY_MIN_MS;
    let retryTimer: number | undefined;

    // The server drops the socket when the access token expires; socket.io does not retry that case.
    // Reconnect only with a renewed session: a refresh can fail and keep the session (server down,
    // rate limit, no network), and the server would refuse the old token again at once.
    const reconnect = async () => {
      const renewed = await refreshSession();
      if (stopped) return;
      if (renewed) {
        socket.connect();
        return;
      }
      retryTimer = window.setTimeout(() => void reconnect(), retryDelay);
      retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
    };

    const stop = () => {
      stopped = true;
      window.clearTimeout(retryTimer);
    };

    // Signed out, or the refresh was refused: close the feed and stop retrying.
    const unsubscribe = session.subscribe((result) => {
      if (result) return;
      stop();
      socket.disconnect();
      setStatus('offline');
    });

    socket.on('connect', () => {
      retryDelay = RETRY_MIN_MS;
      setStatus('live');
    });
    socket.on('disconnect', (reason) => {
      setStatus('offline');
      if (reason === 'io server disconnect') void reconnect();
    });
    socket.on('connect_error', async (err) => {
      setStatus('offline');
      // Expired access token: refresh once, the next reconnection attempt uses the new one.
      if (/unauth|jwt|token/i.test(err.message)) await refreshSession();
    });
    socket.on('access', (log: AccessLogDto) => {
      setEvents((prev) => [log, ...prev.filter((e) => e.id !== log.id)].slice(0, max));
      handler.current?.(log);
    });

    return () => {
      stop();
      unsubscribe();
      socket.disconnect();
    };
  }, [max]);

  return { events, status, setEvents };
}
