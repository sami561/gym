import { useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { Table2, ChartColumn } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { useI18n } from '../../i18n';

/**
 * Chart container: title, optional legend, the chart, and its table-view twin
 * (every value stays reachable without hovering).
 */
export function ChartCard({
  title,
  subtitle,
  legend,
  table,
  children,
  fetching,
  className,
}: {
  title: string;
  subtitle?: ReactNode;
  legend?: ReactNode;
  table: ReactNode;
  children: ReactNode;
  fetching?: boolean;
  className?: string;
}) {
  const [showTable, setShowTable] = useState(false);
  const { t } = useI18n();
  return (
    <Card className={clsx('flex flex-col', className)}>
      <div className="flex items-start justify-between gap-3 px-5 pt-4">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-fg">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-fg-2">{subtitle}</p>}
        </div>
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          aria-pressed={showTable}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-fg-2 ring-1 ring-line hover:text-fg"
        >
          {showTable ? <ChartColumn className="size-3.5" aria-hidden /> : <Table2 className="size-3.5" aria-hidden />}
          {showTable ? t('Graphique') : t('Tableau')}
        </button>
      </div>
      {legend && !showTable && <div className="flex flex-wrap gap-4 px-5 pt-3 text-xs text-fg-2">{legend}</div>}
      <div className={clsx('flex-1 px-2 pt-3 pb-3 transition-opacity', fetching && 'opacity-60')}>
        {showTable ? <div className="scroll-thin max-h-[300px] overflow-auto px-3">{table}</div> : <div dir="ltr">{children}</div>}
      </div>
    </Card>
  );
}

export function LegendKey({ color, label, kind = 'line' }: { color: string; label: string; kind?: 'line' | 'rect' }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={kind === 'line' ? 'h-0.5 w-4 rounded-full' : 'size-2.5 rounded-[3px]'}
        style={{ background: color }}
        aria-hidden
      />
      {label}
    </span>
  );
}

export function DataTableMini({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-line text-start text-xs text-muted">
          {head.map((h, i) => (
            <th key={h} scope="col" className={clsx('py-2 font-semibold', i > 0 && 'text-end')}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, r) => (
          <tr key={r} className="border-b border-line/60 last:border-0">
            {row.map((cell, i) => (
              <td key={i} className={clsx('py-1.5 text-fg', i > 0 && 'text-end tabular')}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
