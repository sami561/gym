import clsx from 'clsx';
import { motion } from 'motion/react';
import { useId } from 'react';
import { useI18n, type TKey } from '../../i18n';

export interface TabItem<K extends string> {
  key: K;
  label: TKey;
  count?: number;
}

/** Segmented tabs; the moving pill shows which view is active. */
export function Tabs<K extends string>({
  items,
  value,
  onChange,
  className,
}: {
  items: TabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  className?: string;
}) {
  const layoutId = useId();
  const { t } = useI18n();
  return (
    <div role="tablist" className={clsx('scroll-thin flex max-w-full gap-1 overflow-x-auto rounded-xl bg-card p-1 ring-1 ring-line', className)}>
      {items.map((item) => {
        const active = item.key === value;
        return (
          <button
            key={item.key}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(item.key)}
            className={clsx(
              'relative flex h-9 items-center gap-2 rounded-lg px-3.5 text-sm font-medium whitespace-nowrap transition-colors',
              active ? 'text-fg' : 'text-fg-2 hover:text-fg',
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-lg bg-card-2 ring-1 ring-line"
                transition={{ type: 'spring', damping: 32, stiffness: 420 }}
              />
            )}
            <span className="relative">{t(item.label)}</span>
            {item.count !== undefined && (
              <span className="relative rounded-full bg-page px-1.5 text-xs text-fg-2 tabular">{item.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
