import type { ReactNode } from 'react';
import clsx from 'clsx';

export type BadgeTone = 'neutral' | 'good' | 'bad' | 'warn' | 'info' | 'brand';

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-card-2 text-fg-2 ring-line',
  good: 'bg-[#0ca30c]/12 text-good ring-[#0ca30c]/30',
  bad: 'bg-[#d03b3b]/12 text-bad ring-[#d03b3b]/30',
  warn: 'bg-[#fab219]/14 text-warn ring-[#fab219]/35',
  info: 'bg-[#3987e5]/12 text-[var(--series-1)] ring-[#3987e5]/30',
  brand: 'bg-brand-500/12 text-brand-400 ring-brand-500/30',
};

export function Badge({ tone = 'neutral', children, className }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ring-1 ring-inset',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Status dot + label: status colour never carries meaning alone. */
export function StatusDot({ tone, label }: { tone: BadgeTone; label: string }) {
  const dot: Record<BadgeTone, string> = {
    neutral: 'bg-muted',
    good: 'bg-[#0ca30c]',
    bad: 'bg-[#d03b3b]',
    warn: 'bg-[#fab219]',
    info: 'bg-[var(--series-1)]',
    brand: 'bg-brand-500',
  };
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-fg-2">
      <span className={clsx('size-2 rounded-full', dot[tone])} aria-hidden />
      {label}
    </span>
  );
}
