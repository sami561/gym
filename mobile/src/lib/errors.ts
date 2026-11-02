import { ApiError } from '@/api/client';
import type { TranslationKey } from '@/i18n';

/** User-facing message: server messages are already localized (French), transport errors are translated. */
export function errorMessage(error: unknown, t: (key: TranslationKey) => string): string {
  if (error instanceof ApiError) {
    if (error.kind === 'network') return t('errors.network');
    if (error.kind === 'timeout') return t('errors.timeout');
    if (error.kind === 'session') return t('errors.session');
    if (error.message && !error.message.startsWith('HTTP ')) return error.message;
  }
  return t('errors.generic');
}
