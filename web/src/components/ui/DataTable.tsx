import type { ReactElement, ReactNode } from 'react';
import { useI18n, type TKey } from '../../i18n';
import clsx from 'clsx';
import { Skeleton } from './Spinner';

export interface Column<T> {
  key: string;
  /** i18n key, or an element (e.g. a visually hidden label). */
  header: TKey | ReactElement;
  cell: (row: T) => ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
  /** Hide below the md breakpoint to keep phones readable. */
  hideOnMobile?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  loading?: boolean;
  /** Refetch in progress: keep the frame, dim the rows. */
  fetching?: boolean;
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
  caption?: string;
}

export function DataTable<T>({ columns, rows, rowKey, loading, fetching, empty, onRowClick, caption }: DataTableProps<T>) {
  const { t } = useI18n();
  const align = (a?: 'left' | 'right' | 'center') =>
    a === 'right' ? 'text-end' : a === 'center' ? 'text-center' : 'text-start';

  return (
    <div className="scroll-thin overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b border-line">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={clsx(
                  'px-4 py-2.5 text-xs font-semibold whitespace-nowrap text-muted',
                  align(col.align),
                  col.hideOnMobile && 'hidden md:table-cell',
                  col.className,
                )}
              >
                {typeof col.header === 'string' ? t(col.header) : col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={clsx('transition-opacity', fetching && !loading && 'opacity-60')}>
          {loading &&
            Array.from({ length: 5 }).map((_, i) => (
              <tr key={`sk-${i}`} className="border-b border-line/60">
                {columns.map((col) => (
                  <td key={col.key} className={clsx('px-4 py-3', col.hideOnMobile && 'hidden md:table-cell')}>
                    <Skeleton className="h-4 w-full max-w-[160px]" />
                  </td>
                ))}
              </tr>
            ))}
          {!loading &&
            rows?.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.key === 'Enter') onRowClick(row);
                      }
                    : undefined
                }
                tabIndex={onRowClick ? 0 : undefined}
                className={clsx(
                  'border-b border-line/60 last:border-0',
                  onRowClick && 'cursor-pointer hover:bg-[var(--hover-wash)] focus-visible:bg-[var(--hover-wash)]',
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={clsx(
                      'px-4 py-3 align-middle text-fg',
                      align(col.align),
                      col.align === 'right' && 'tabular',
                      col.hideOnMobile && 'hidden md:table-cell',
                      col.className,
                    )}
                  >
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
      {!loading && rows && rows.length === 0 && empty}
    </div>
  );
}
