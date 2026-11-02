import { ChevronLeft, ChevronRight } from 'lucide-react';
import { IconButton } from './Button';
import { formatInt } from '../../lib/format';
import { useI18n } from '../../i18n';

export function Pagination({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const { t } = useI18n();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm text-fg-2">
      <span className="tabular">{t('{from}–{to} sur {total}', { from: formatInt(from), to: formatInt(to), total: formatInt(total) })}</span>
      <div className="flex items-center gap-1">
        <IconButton label={t('Page précédente')} disabled={page <= 1} onClick={() => onChange(page - 1)}>
          <ChevronLeft className="size-4 rtl:-scale-x-100" />
        </IconButton>
        <span className="px-2 tabular">
          {page} / {pages}
        </span>
        <IconButton label={t('Page suivante')} disabled={page >= pages} onClick={() => onChange(page + 1)}>
          <ChevronRight className="size-4 rtl:-scale-x-100" />
        </IconButton>
      </div>
    </div>
  );
}
