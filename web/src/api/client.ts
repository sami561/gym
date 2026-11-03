import type { ApiErrorBody, AuthResult } from './types';
import { currentLang, translate } from '../i18n';

/** Gateway base URL. Empty in dev: Vite proxies /api and /socket.io to the gateway. */
export const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

const REFRESH_KEY = 'meliora.refreshToken';

export class ApiError extends Error {
  readonly status: number;
  readonly messages: string[];

  constructor(status: number, messages: string[]) {
    super(messages[0] ?? 'Erreur inattendue.');
    this.name = 'ApiError';
    this.status = status;
    this.messages = messages;
  }
}

type SessionListener = (session: AuthResult | null) => void;

let accessToken: string | null = null;
/** Refresh token the browser refused to store (private mode, blocked or full storage). */
let unsavedRefreshToken: string | null = null;
let refreshInFlight: Promise<AuthResult | null> | null = null;
const listeners = new Set<SessionListener>();

function readRefreshToken(): string | null {
  if (unsavedRefreshToken) return unsavedRefreshToken;
  try {
    return localStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

function writeRefreshToken(token: string | null): void {
  unsavedRefreshToken = null;
  try {
    if (token) localStorage.setItem(REFRESH_KEY, token);
    else localStorage.removeItem(REFRESH_KEY);
  } catch {
    // Storage unavailable: keep the token in memory, the session lasts for this tab only.
    unsavedRefreshToken = token;
  }
}

export const session = {
  getAccessToken: () => accessToken,
  hasRefreshToken: () => Boolean(readRefreshToken()),
  /** Access token stays in memory; the refresh token survives reloads in localStorage. */
  set(result: AuthResult) {
    accessToken = result.accessToken;
    writeRefreshToken(result.refreshToken);
    listeners.forEach((listener) => listener(result));
  },
  clear() {
    accessToken = null;
    writeRefreshToken(null);
    listeners.forEach((listener) => listener(null));
  },
  subscribe(listener: SessionListener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

/**
 * Single-flight refresh: concurrent 401s share one /auth/refresh call. Resolves the new session,
 * or null when it was refused, could not be checked, or the session changed in the meantime.
 */
export function refreshSession(): Promise<AuthResult | null> {
  const refreshToken = readRefreshToken();
  if (!refreshToken) return Promise.resolve(null);
  if (!refreshInFlight) {
    refreshInFlight = fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
      .then(async (res) => {
        const result = res.ok ? ((await res.json()) as AuthResult) : null;
        // Checked after the last await. If the token sent was replaced meanwhile (sign-out, sign-in,
        // password change, here or in another tab), the answer is about the old session: ignore it,
        // so it neither signs the user back in nor ends the new session.
        if (readRefreshToken() !== refreshToken) return null;
        if (result) session.set(result);
        else if (res.status === 401 || res.status === 403) session.clear();
        return result;
      })
      .catch(() => null)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

export type Query = Record<string, string | number | boolean | null | undefined>;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** Sent as JSON, or as is for a FormData (multipart: the browser writes the content type and boundary). */
  body?: unknown;
  query?: Query;
  /** Send the bearer token (default true). */
  auth?: boolean;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: Query): string {
  const params = new URLSearchParams();
  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  });
  const qs = params.toString();
  return `${API_BASE}${path}${qs ? `?${qs}` : ''}`;
}

async function toApiError(res: Response): Promise<ApiError> {
  let messages: string[] = [];
  try {
    const body = (await res.json()) as Partial<ApiErrorBody>;
    if (Array.isArray(body.message)) messages = body.message;
    else if (typeof body.message === 'string') messages = [body.message];
  } catch {
    /* non-JSON error body */
  }
  if (!messages.length) {
    const lang = currentLang();
    messages = [
      res.status >= 500
        ? translate(lang, 'Le serveur ne répond pas correctement. Réessayez dans un instant.')
        : translate(lang, 'Requête refusée ({status}).', { status: res.status }),
    ];
  }
  return new ApiError(res.status, messages);
}

/**
 * Sends the request with the access token; on a 401 refreshes the session once (single-flight) and
 * replays it. Resolves the successful response, rejects with an ApiError.
 */
async function request(path: string, options: RequestOptions): Promise<Response> {
  const { method = 'GET', body, query, auth = true, signal } = options;
  const url = buildUrl(path, query);
  const form = body instanceof FormData ? body : null;

  const send = () =>
    fetch(url, {
      method,
      signal,
      headers: {
        ...(body !== undefined && !form ? { 'Content-Type': 'application/json' } : {}),
        ...(auth && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });

  let res: Response;
  try {
    res = await send();
    if (res.status === 401 && auth && readRefreshToken()) {
      const refreshed = await refreshSession();
      if (refreshed) res = await send();
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(0, [translate(currentLang(), 'Impossible de joindre le serveur. Vérifiez votre connexion.')]);
  }

  if (!res.ok) throw await toApiError(res);
  return res;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await request(path, options);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Binary answer (member photos), with the same token, refresh and errors as api(). */
export async function apiBlob(path: string, options: Omit<RequestOptions, 'body'> = {}): Promise<Blob> {
  const res = await request(path, options);
  return res.blob();
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.messages.join(' · ');
  if (error instanceof Error) return error.message;
  return translate(currentLang(), 'Erreur inattendue.');
}
