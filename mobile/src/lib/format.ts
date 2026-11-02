/** Date-only strings (YYYY-MM-DD) are calendar days in the gym's timezone: parse them as local dates. */
export function parseDate(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(value);
}

export function toDateOnly(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function startOfDay(date: Date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Whole calendar days from today to `value` (negative when in the past). */
export function daysFromToday(value: string): number {
  return Math.round((startOfDay(parseDate(value)).getTime() - startOfDay().getTime()) / 86_400_000);
}

export function formatDate(value: string | Date, locale: string, options?: Intl.DateTimeFormatOptions): string {
  const date = typeof value === 'string' ? parseDate(value) : value;
  return new Intl.DateTimeFormat(locale, options ?? { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

export function formatShortDate(value: string | Date, locale: string): string {
  return formatDate(value, locale, { day: 'numeric', month: 'short' });
}

export function formatTime(value: string | Date, locale: string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(date);
}

export function formatDateTime(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function formatWeekday(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date).replace('.', '');
}

/** TND with 3 decimals: "120,500 DT" (fr) / "120.500 TND" (en) / "120,500 د.ت" (ar). */
export function formatMoney(amount: number, locale: string): string {
  const formatted = new Intl.NumberFormat(locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(
    amount,
  );
  if (locale.startsWith('ar')) return `${formatted} د.ت`;
  return locale.startsWith('fr') ? `${formatted} DT` : `${formatted} TND`;
}

export function formatNumber(value: number, locale: string, digits = 1): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value);
}

export function initials(firstName?: string | null, lastName?: string | null): string {
  return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase() || 'M';
}
