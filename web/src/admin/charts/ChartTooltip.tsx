import type { ReactNode } from 'react';

export interface TooltipRow {
  color: string;
  label: string;
  value: string;
}

/** Values lead, labels follow; series keyed by a short line of their colour. */
export function TooltipBox({ title, rows }: { title: ReactNode; rows: TooltipRow[] }) {
  return (
    <div className="min-w-[150px] rounded-lg bg-card px-3 py-2.5 text-sm shadow-xl ring-1 ring-line">
      <p className="mb-1.5 text-xs text-muted">{title}</p>
      <ul className="flex flex-col gap-1">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-2">
            <span className="h-0.5 w-3 rounded-full" style={{ background: row.color }} aria-hidden />
            <span className="font-semibold text-fg tabular">{row.value}</span>
            <span className="text-fg-2">{row.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
