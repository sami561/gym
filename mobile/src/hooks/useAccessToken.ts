import { useSyncExternalStore } from 'react';
import { session } from '@/api/client';

/**
 * The current access token, re-rendering after every refresh and sign-out. For requests made outside api(), such as
 * the member photo that expo-image loads with the token in its headers.
 */
export function useAccessToken(): string | null {
  return useSyncExternalStore(session.subscribe, session.accessToken);
}
