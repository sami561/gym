import { Platform } from 'react-native';
import { storage, STORAGE_KEYS } from '@/lib/storage';
import type { AuthResult } from './types';

const DEFAULT_URL = Platform.select({ android: 'http://10.0.2.2:4000', default: 'http://localhost:4000' });

/** Gateway origin, e.g. http://192.168.1.20:4000 (all routes live under /api). */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || DEFAULT_URL).replace(/\/+$/, '');

export type ApiErrorKind = 'http' | 'network' | 'timeout' | 'session';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly kind: ApiErrorKind = 'http',
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

let tokens: Tokens | null = null;
let refreshInFlight: Promise<AuthResult | null> | null = null;
let onSessionExpired: () => void = () => {};
let onRefreshed: (result: AuthResult) => void = () => {};

/** Token persistence + hooks used by the AuthProvider. */
export const session = {
  async restore(): Promise<boolean> {
    tokens = await storage.getJSON<Tokens>(STORAGE_KEYS.tokens);
    return tokens !== null;
  },
  async save(next: Tokens): Promise<void> {
    tokens = { accessToken: next.accessToken, refreshToken: next.refreshToken };
    await storage.setJSON(STORAGE_KEYS.tokens, tokens);
  },
  async clear(): Promise<void> {
    tokens = null;
    await storage.remove(STORAGE_KEYS.tokens);
  },
  hasTokens(): boolean {
    return tokens !== null;
  },
  setHandlers(handlers: { onSessionExpired: () => void; onRefreshed: (result: AuthResult) => void }) {
    onSessionExpired = handlers.onSessionExpired;
    onRefreshed = handlers.onRefreshed;
  },
};

type Query = Record<string, string | number | boolean | null | undefined>;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Query;
  /** Attach the bearer token and refresh it on 401 (default true). */
  auth?: boolean;
  timeoutMs?: number;
}

function buildQuery(query?: Query): string {
  if (!query) return '';
  const parts = Object.entries(query)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

async function rawFetch(path: string, init: RequestInit, timeoutMs = 15_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${API_URL}/api${path}`, { ...init, signal: controller.signal });
  } catch {
    if (controller.signal.aborted) throw new ApiError(0, 'timeout', 'timeout');
    throw new ApiError(0, 'network', 'network');
  } finally {
    clearTimeout(timer);
  }
}

async function toApiError(res: Response): Promise<ApiError> {
  let message = `HTTP ${res.status}`;
  try {
    const body = (await res.json()) as { message?: string | string[] };
    if (Array.isArray(body.message)) message = body.message.join('\n');
    else if (body.message) message = body.message;
  } catch {
    // non-JSON error body
  }
  return new ApiError(res.status, message);
}

/** Exchanges the refresh token once, even when several requests fail with 401 at the same time. */
async function refreshSession(): Promise<AuthResult | null> {
  if (!tokens) return null;
  if (!refreshInFlight) {
    const refreshToken = tokens.refreshToken;
    refreshInFlight = (async () => {
      try {
        const res = await rawFetch('/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) return null;
        const result = (await res.json()) as AuthResult;
        await session.save(result);
        onRefreshed(result);
        return result;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true, timeoutMs } = options;
  const url = path + buildQuery(options.query);

  const send = () =>
    rawFetch(
      url,
      {
        method,
        headers: {
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(auth && tokens ? { Authorization: `Bearer ${tokens.accessToken}` } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      },
      timeoutMs,
    );

  let res = await send();

  if (res.status === 401 && auth && tokens) {
    const refreshed = await refreshSession();
    if (!refreshed) {
      await session.clear();
      onSessionExpired();
      throw new ApiError(401, 'session', 'session');
    }
    res = await send();
  }

  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
