import { QueryClient } from '@tanstack/react-query';
import { ApiError, session } from './client';

/**
 * The app's react-query cache. It is emptied when the session ends (sign-out, refused refresh), so no
 * answer fetched with a staff token (member photos, lists) is shown to whoever uses the browser next.
 */
export function createQueryClient(): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // Client errors (401/403/404/422) will not fix themselves: no retry.
        retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 1,
      },
    },
  });
  session.subscribe((result) => {
    if (!result) queryClient.clear();
  });
  return queryClient;
}
