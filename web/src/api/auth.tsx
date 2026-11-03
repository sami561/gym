import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError, refreshSession, session } from './client';
import { authApi } from './endpoints';
import type { Role, UserDto } from './types';
import { currentLang, translate } from '../i18n';

export const BACKOFFICE_ROLES: Role[] = ['ADMIN', 'STAFF', 'COACH'];

type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  status: AuthStatus;
  user: UserDto | null;
  login: (email: string, password: string) => Promise<UserDto>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(null);
  const [status, setStatus] = useState<AuthStatus>(() =>
    session.hasRefreshToken() ? 'loading' : 'anonymous',
  );

  // Keep React state in sync with token changes (refresh, expiry, logout in another call).
  useEffect(
    () =>
      session.subscribe((result) => {
        if (result && BACKOFFICE_ROLES.includes(result.user.role)) {
          setUser(result.user);
          setStatus('authenticated');
        } else {
          setUser(null);
          setStatus('anonymous');
        }
      }),
    [],
  );

  // Restore the session from the stored refresh token on first load.
  useEffect(() => {
    if (!session.hasRefreshToken()) return;
    refreshSession().then((result) => {
      // A sign-in made on the login page while this ran keeps its session (the answer was ignored).
      if (!result && !session.getAccessToken()) setStatus('anonymous');
    });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await authApi.login(email.trim().toLowerCase(), password);
    if (!BACKOFFICE_ROLES.includes(result.user.role)) {
      throw new ApiError(403, [translate(currentLang(), 'Cet espace est réservé à l’équipe Meliora. Les membres utilisent l’application mobile.')]);
    }
    session.set(result);
    return result.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      /* already expired: clearing locally is enough */
    }
    session.clear();
  }, []);

  const value = useMemo(() => ({ status, user, login, logout }), [status, user, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
