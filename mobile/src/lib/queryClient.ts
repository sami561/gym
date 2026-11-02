import { AppState, Platform } from 'react-native';
import { focusManager, QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/api/client';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Retry transient failures only; 4xx answers are final.
      retry: (failureCount, error) =>
        failureCount < 2 && !(error instanceof ApiError && (error.kind === 'http' || error.kind === 'session')),
    },
    mutations: { retry: false },
  },
});

/** Refetch stale queries when the app comes back to the foreground. */
export function bindAppFocus(): () => void {
  if (Platform.OS === 'web') return () => undefined;
  const subscription = AppState.addEventListener('change', (status) => {
    focusManager.setFocused(status === 'active');
  });
  return () => subscription.remove();
}
