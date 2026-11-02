import type { ReactNode } from 'react';
import clsx from 'clsx';
import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Skeleton } from '../../components/ui/Spinner';

export interface Delta {
  /** Signed change, already formatted (e.g. "+12 %"). */
  label: string;
  direction: 'up' | 'down' | 'flat';
  /** Whether going up is good for this metric. */
  upIsGood?: boolean;
  /** Named comparison period, e.g. "vs mois dernier". */
  period: string;
}

/** Stat tile contract: label · value · optional delta (icon + text, never colour alone) · note. */
export function StatTile({
  label,
  value,
  delta,
  note,
  status,
  loading,
}: {
  label: string;
  value: ReactNode;
  delta?: Delta;
  note?: ReactNode;
  status?: ReactNode;
  loading?: boolean;
}) {
  const good = delta && delta.direction !== 'flat' && (delta.direction === 'up') === (delta.upIsGood ?? true);
  const Icon = delta?.direction === 'up' ? TrendingUp : delta?.direction === 'down' ? TrendingDown : Minus;
  return (
    <Card className="flex flex-col gap-2 px-5 py-4">
      <p className="text-sm text-fg-2">{label}</p>
      {loading ? (
        <Skeleton className="h-8 w-28" />
      ) : (
        <p className="text-[28px] leading-tight font-semibold text-fg">{value}</p>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {delta && !loading && (
          <span className={clsx('inline-flex items-center gap-1 font-semibold', delta.direction === 'flat' ? 'text-fg-2' : good ? 'text-good' : 'text-bad')}>
            <Icon className="size-3.5" aria-hidden />
            {delta.label}
            <span className="font-normal text-muted">{delta.period}</span>
          </span>
        )}
        {status}
        {note && <span className="text-muted">{note}</span>}
      </div>
    </Card>
  );
}
