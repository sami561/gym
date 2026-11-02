import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ApiError, session } from '@/api/client';
import { authApi } from '@/api/endpoints';
import type { AuthResult, RegisterRequest, UserDto } from '@/api/types';
import { queryClient } from '@/lib/queryClient';
import { storage, STORAGE_KEYS } from '@/lib/storage';

type Status = 'loading' | 'signedOut' | 'signedIn';

interface AuthContextValue {
  status: Status;
  user: UserDto | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (data: RegisterRequest) => Promise<void>;
  signOut: () => Promise<void>;
  /** The server ends every other session; this phone keeps the fresh one it returns. */
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  updateUser: (patch: Partial<UserDto>) => void;
}

export class MembersOnlyError extends Error {
  constructor() {
    super('members-only');
    this.name = 'MembersOnlyError';
  }
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function wipeLocalSession(): Promise<void> {
  await session.clear();
  await Promise.all([
    storage.remove(STORAGE_KEYS.user),
    storage.remove(STORAGE_KEYS.accessKey),
    storage.remove(STORAGE_KEYS.pushToken),
  ]);
  queryClient.clear();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<UserDto | null>(null);

  useEffect(() => {
    session.setHandlers({
      onSessionExpired: () => {
        wipeLocalSession().finally(() => {
          setUser(null);
          setStatus('signedOut');
        });
      },
      onRefreshed: (result) => {
        setUser(result.user);
        storage.setJSON(STORAGE_KEYS.user, result.user).catch(() => undefined);
      },
    });

    (async () => {
      const hasSession = await session.restore();
      if (!hasSession) {
        setStatus('signedOut');
        return;
      }
      // Optimistic start with the cached user so the app (and the offline QR pass) opens without network.
      const cached = await storage.getJSON<UserDto>(STORAGE_KEYS.user);
      if (cached) {
        setUser(cached);
        setStatus('signedIn');
      }
      try {
        const fresh = await authApi.me();
        if (fresh.role !== 'MEMBER') {
          await wipeLocalSession();
          setUser(null);
          setStatus('signedOut');
          return;
        }
        setUser(fresh);
        await storage.setJSON(STORAGE_KEYS.user, fresh);
        setStatus('signedIn');
      } catch (error) {
        const authFailure =
          error instanceof ApiError &&
          (error.kind === 'session' || (error.kind === 'http' && [401, 403, 404].includes(error.status)));
        if (authFailure) {
          // 'session' was already handled by onSessionExpired.
          if (error.kind !== 'session') await wipeLocalSession();
          setUser(null);
          setStatus('signedOut');
        } else {
          // Server unreachable: keep the session, screens show their own retry states.
          setStatus('signedIn');
        }
      }
    })();
  }, []);

  const acceptSession = useCallback(async (result: AuthResult) => {
    if (result.user.role !== 'MEMBER') {
      // Staff accounts use the web back-office; do not keep their tokens on a member device.
      await session.save(result);
      await authApi.logout().catch(() => undefined);
      await wipeLocalSession();
      throw new MembersOnlyError();
    }
    await session.save(result);
    await storage.setJSON(STORAGE_KEYS.user, result.user);
    queryClient.clear();
    setUser(result.user);
    setStatus('signedIn');
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const result = await authApi.login({ email: email.trim().toLowerCase(), password });
      await acceptSession(result);
    },
    [acceptSession],
  );

  const signUp = useCallback(
    async (data: RegisterRequest) => {
      const result = await authApi.register({ ...data, email: data.email.trim().toLowerCase() });
      await acceptSession(result);
    },
    [acceptSession],
  );

  const signOut = useCallback(async () => {
    await authApi.logout().catch(() => undefined);
    await wipeLocalSession();
    setUser(null);
    setStatus('signedOut');
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const result = await authApi.changePassword({ currentPassword, newPassword });
    // The tokens this phone held were just revoked with every other session: keep the fresh
    // pair the way sign-in and refresh do. (A server without rotation answers { ok: true } only.)
    if (!result?.accessToken || !result.refreshToken) return;
    await session.save(result);
    await storage.setJSON(STORAGE_KEYS.user, result.user);
    setUser(result.user);
  }, []);

  const updateUser = useCallback((patch: Partial<UserDto>) => {
    setUser((current) => {
      if (!current) return current;
      const next = { ...current, ...patch };
      storage.setJSON(STORAGE_KEYS.user, next).catch(() => undefined);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ status, user, signIn, signUp, signOut, changePassword, updateUser }),
    [status, user, signIn, signUp, signOut, changePassword, updateUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
