import type { HTMLAttributes, ReactNode } from 'react';
import clsx from 'clsx';
import { useI18n } from '../../i18n';

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx('rounded-xl bg-card ring-1 ring-line', className)} {...rest} />;
}

export function CardHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx('flex flex-wrap items-start justify-between gap-3 px-5 pt-4 pb-3', className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-fg">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-fg-2">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="type-wide text-2xl text-fg sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-fg-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx('flex flex-col items-center justify-center gap-2 px-6 py-12 text-center', className)}>
      {icon && <div className="mb-1 text-muted">{icon}</div>}
      <p className="font-semibold text-fg">{title}</p>
      {description && <p className="max-w-sm text-sm text-fg-2">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[#d03b3b]/10 px-4 py-3 text-sm text-bad ring-1 ring-[#d03b3b]/30">
      <span>{message}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="font-semibold underline underline-offset-2">
          {t('Réessayer')}
        </button>
      )}
    </div>
  );
}
