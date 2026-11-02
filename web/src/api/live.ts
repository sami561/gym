import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { API_BASE, refreshSession, session } from './client';
import type { AccessLogDto } from './types';

export type LiveStatus = 'connecting' | 'live' | 'offline';

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

    socket.on('connect', () => setStatus('live'));
    socket.on('disconnect', async (reason) => {
      setStatus('offline');
      // The server drops the socket when the access token expires; socket.io does not retry that case.
      if (reason === 'io server disconnect') {
        await refreshSession();
        socket.connect();
      }
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
      socket.disconnect();
    };
  }, [max]);

  return { events, status, setEvents };
}
