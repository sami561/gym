import type { MessageKey } from '../i18n/messages';
import type {
  AccessMethod,
  BookingStatus,
  DoorDriver,
  MemberStatus,
  PaymentMethod,
  Role,
  SubscriptionStatus,
} from '../api/types';

type AppLang = 'fr' | 'en' | 'ar';

const LOCALES: Record<AppLang, string> = { fr: 'fr-FR', en: 'en-GB', ar: 'ar-TN' };
const CURRENCY: Record<AppLang, string> = { fr: 'DT', en: 'DT', ar: 'د.ت' };

/** signDisplay 'negative' needs Chrome 106, Firefox 116 or Safari 15.4; older engines throw on it. */
function negativeSignOnly(): { signDisplay?: 'negative' } {
  try {
    new Intl.NumberFormat('en', { signDisplay: 'negative' });
    return { signDisplay: 'negative' };
  } catch {
    return {};
  }
}

// Latin digits in every language; a value that rounds to zero prints "0", never "-0" (where supported).
const NUMBERS = { numberingSystem: 'latn', ...negativeSignOnly() } as const;

let LANG: AppLang = 'fr';
let LOCALE = LOCALES.fr;
let formatters = buildFormatters(LOCALE);

function buildFormatters(locale: string) {
  return {
    tnd: new Intl.NumberFormat(locale, { minimumFractionDigits: 3, maximumFractionDigits: 3, ...NUMBERS }),
    tndShort: new Intl.NumberFormat(locale, { maximumFractionDigits: 0, ...NUMBERS }),
    compact: new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1, ...NUMBERS }),
    integer: new Intl.NumberFormat(locale, NUMBERS),
    relative: new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }),
  };
}

/** Called by the i18n provider: every formatter below follows the UI language. */
export function setFormatLocale(lang: AppLang): void {
  if (lang === LANG) return;
  LANG = lang;
  LOCALE = LOCALES[lang];
  formatters = buildFormatters(LOCALE);
}

export function currentLocale(): string {
  return LOCALE;
}

/** 120.5 → "120,500 DT" (fr), "120.500 DT" (en), "120,500 د.ت" (ar) */
export function formatTND(value: number | null | undefined): string {
  return `${formatters.tnd.format(value ?? 0)} ${CURRENCY[LANG]}`;
}

/** 1250.75 → "1 251 DT" (tiles, where millimes are noise) */
export function formatTNDShort(value: number | null | undefined): string {
  return `${formatters.tndShort.format(value ?? 0)} ${CURRENCY[LANG]}`;
}

export function currencySymbol(): string {
  return CURRENCY[LANG];
}

/** Axis ticks: 0 / 950 / 1,2 k / 12 k */
export function formatCompact(value: number): string {
  return Math.abs(value) < 1000 ? formatters.integer.format(value) : formatters.compact.format(value);
}

export function formatInt(value: number | null | undefined): string {
  return formatters.integer.format(value ?? 0);
}

export function formatNumber(value: number, maxDigits = 1): string {
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits: maxDigits, ...NUMBERS }).format(value);
}

export function formatPercent(ratio: number, digits = 0): string {
  return new Intl.NumberFormat(LOCALE, { style: 'percent', maximumFractionDigits: digits, ...NUMBERS }).format(ratio);
}

/** Accepts ISO date-times and date-only strings (YYYY-MM-DD, read as local dates). */
export function toDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(value);
}

export function formatDate(value: string | Date | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!value) return '—';
  return toDate(value).toLocaleDateString(LOCALE, { numberingSystem: 'latn', ...(opts ?? { day: 'numeric', month: 'short', year: 'numeric' }) });
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return toDate(value).toLocaleString(LOCALE, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    numberingSystem: 'latn',
  });
}

/** Always 24 h "HH:MM", Latin digits (also used to fill <input type="time">). */
export function formatTime(value: string | Date): string {
  const d = toDate(value);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function formatWeekday(value: string | Date, style: 'long' | 'short' = 'long'): string {
  const label = toDate(value).toLocaleDateString(LOCALE, { weekday: style });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** "il y a 5 minutes" / "5 minutes ago" / "قبل 5 دقائق" */
export function relativeTime(value: string | Date): string {
  const diff = (toDate(value).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 45) return formatters.relative.format(0, 'second');
  if (abs < 3600) return formatters.relative.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return formatters.relative.format(Math.round(diff / 3600), 'hour');
  if (abs < 7 * 86400) return formatters.relative.format(Math.round(diff / 86400), 'day');
  return formatDateTime(value);
}

/** "18 h" / "6 PM"-free 24 h hour label for axes. */
export function hourLabel(hour: number): string {
  return LANG === 'ar' ? `${hour}:00` : `${hour}h`;
}

/** Local calendar day as YYYY-MM-DD. */
export function isoDay(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** Monday 00:00 of the week containing `date`. */
export function startOfWeek(date: Date = new Date()): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - offset);
  return start;
}

/** "2026-03" → "mars" / "mars 26" */
export function monthLabel(key: string, withYear = false): string {
  const [y, m] = key.split('-').map(Number);
  const date = new Date(y, m - 1, 1);
  return date
    .toLocaleDateString(LOCALE, withYear ? { month: 'short', year: '2-digit', numberingSystem: 'latn' } : { month: 'short' })
    .replace('.', '');
}

export function fullName(person: { firstName: string; lastName: string }): string {
  return `${person.firstName} ${person.lastName}`.trim();
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export const ROLE_LABELS: Record<Role, MessageKey> = {
  ADMIN: 'Administrateur',
  STAFF: 'Accueil',
  COACH: 'Coach',
  MEMBER: 'Membre',
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, MessageKey> = {
  CASH: 'Espèces',
  CARD: 'Carte bancaire',
  TRANSFER: 'Virement',
  D17: 'D17',
};

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, MessageKey> = {
  ACTIVE: 'Actif',
  FROZEN: 'Gelé',
  EXPIRED: 'Expiré',
  CANCELLED: 'Annulé',
};

export const MEMBER_STATUS_LABELS: Record<MemberStatus, MessageKey> = {
  ACTIVE: 'Actif',
  SUSPENDED: 'Suspendu',
};

export const BOOKING_STATUS_LABELS: Record<BookingStatus, MessageKey> = {
  BOOKED: 'Réservé',
  WAITLISTED: 'Liste d’attente',
  CANCELLED: 'Annulé',
  LATE_CANCELLED: 'Annulé tard',
  ATTENDED: 'Présent',
  NO_SHOW: 'Absent',
};

export const ACCESS_METHOD_LABELS: Record<AccessMethod, MessageKey> = {
  QR: 'QR code',
  APP: 'Application',
  CARD: 'Badge',
  FINGERPRINT: 'Empreinte',
  MANUAL: 'Manuel',
};

export const DOOR_DRIVER_LABELS: Record<DoorDriver, MessageKey> = {
  ZKTECO: 'Terminal ZKTeco',
  HTTP_RELAY: 'Relais HTTP',
  SIMULATOR: 'Simulateur',
};
