import { useEffect, useState } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { promosApi } from '../../../api/endpoints-ops';
import { errorMessage } from '../../../api/client';
import type { PromoQuote } from '../../../api/types-ops';
import { Input } from '../../../components/ui/Field';
import { formatTND } from '../../../lib/format';
import { useI18n } from '../../../i18n';

/** Checks a promo code against the selected plan (debounced). */
export function usePromoQuote(code: string, planId: string): UseQueryResult<PromoQuote> {
  const [debounced, setDebounced] = useState(code);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(code.trim().toUpperCase()), 400);
    return () => window.clearTimeout(id);
  }, [code]);
  return useQuery({
    queryKey: ['promo-quote', debounced, planId],
    queryFn: () => promosApi.check(debounced, planId),
    enabled: Boolean(debounced && planId),
    retry: false,
  });
}

export function PromoField({ value, onChange, quote }: { value: string; onChange: (value: string) => void; quote: UseQueryResult<PromoQuote> }) {
  const { t } = useI18n();
  const hint = !value.trim()
    ? t('Facultatif')
    : quote.isFetching
      ? t('Vérification…')
      : quote.data
        ? t('Remise de {amount} appliquée', { amount: formatTND(quote.data.discount) })
        : undefined;
  return (
    <Input
      label={t('Code promo')}
      value={value}
      onChange={(e) => onChange(e.target.value.toUpperCase())}
      placeholder="RENTREE26"
      hint={hint}
      error={value.trim() && quote.isError ? errorMessage(quote.error) : undefined}
      autoComplete="off"
    />
  );
}
