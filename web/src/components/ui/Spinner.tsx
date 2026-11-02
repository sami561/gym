import clsx from 'clsx';
import { useI18n } from '../../i18n';

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={clsx('animate-spin', className ?? 'size-5')} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function PageSpinner({ label }: { label?: string }) {
  const { t } = useI18n();
  label = label ?? t('Chargement…');
  return (
    <div className="flex min-h-[40vh] items-center justify-center gap-3 text-fg-2" role="status">
      <Spinner />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded-md bg-card-2', className)} aria-hidden />;
}
