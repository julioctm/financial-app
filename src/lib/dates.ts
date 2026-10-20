import { asUnmatched } from '@/lib/unmatched';

// Months travel as 'YYYY-MM' in URLs and as 'YYYY-MM-01' in the database.

const SHORT_MONTHS = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
];

export function currentMonthKey(): string {
  return new Date()
    .toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
    .slice(0, 7);
}

export function isMonthKey(v: string | undefined): v is string {
  return !!v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

// 'outubro de 2026' with only the first letter capitalized.
export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  const text = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// '2026-10-01' -> '10/2026'
export function formatPaymentMonth(v: string | null | undefined): string {
  if (!v) return '';
  const [y, m] = v.split('-');
  return `${m}/${y}`;
}

// Accepts '10/2026', '10/26', '2026-10', 'out/2026', 'out 2026' -> '2026-10-01'; null if invalid.
export function parsePaymentMonth(
  input: string | null | undefined,
): string | null {
  const s = (input ?? '').trim().toLowerCase();
  if (!s) return null;
  let m: RegExpMatchArray | null;
  let year: number;
  let month: number;
  if ((m = s.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/))) {
    year = Number(m[1]);
    month = Number(m[2]);
  } else if ((m = s.match(/^(\d{1,2})[/\-.\s](\d{2}|\d{4})$/))) {
    month = Number(m[1]);
    year = Number(m[2]) < 100 ? 2000 + Number(m[2]) : Number(m[2]);
  } else if ((m = s.match(/^([a-zç]{3})[a-z]*[/\-.\s](\d{2}|\d{4})$/))) {
    month = SHORT_MONTHS.indexOf(m[1]) + 1;
    year = Number(m[2]) < 100 ? 2000 + Number(m[2]) : Number(m[2]);
  } else return null;
  if (month < 1 || month > 12 || year < 1990 || year > 2100) return null;
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

// Suggests the payment month: purchase month, or the next one when the purchase
// is after the account's closing day. Always editable by the user.
export function suggestPaymentMonth(
  purchaseDate: string,
  closingDay: number | null,
): string {
  const key = purchaseDate.slice(0, 7);
  const day = Number(purchaseDate.slice(8, 10));
  const month = closingDay && day > closingDay ? shiftMonth(key, 1) : key;
  return `${month}-01`;
}

// '2026-10-19' -> '19/10/2026'
export function formatDateBr(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

// Accepts '19/10/2026', '19/10/26', '1/2/2026', '19-10-2026', '19.10.2026' and '2026-10-19'
// (pasted from a spreadsheet or typed) -> '2026-10-19'. Returns null for anything that is
// not a real calendar date (e.g. 31/02/2026).
export function parseDateInput(
  input: string | null | undefined,
): string | null {
  const s = (input ?? '').trim();
  if (!s) return null;
  let m: RegExpMatchArray | null;
  let y: number;
  let mo: number;
  let d: number;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) {
    y = Number(m[1]);
    mo = Number(m[2]);
    d = Number(m[3]);
  } else if ((m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})$/))) {
    d = Number(m[1]);
    mo = Number(m[2]);
    y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
  } else return null;
  if (y < 1990 || y > 2100 || mo < 1 || mo > 12 || d < 1) return null;
  const lastDay = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  if (d > lastDay) return null;
  return `${y}-${pad2(mo)}-${pad2(d)}`;
}

// Today in the app's timezone, as 'YYYY-MM-DD'.
export function todayIso(): string {
  return new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/Sao_Paulo',
  });
}

// ---------------------------------------------------------------------------
// Payment month as the spreadsheet shows it: month ("JAN") and year (2026) in separate columns
// ---------------------------------------------------------------------------

export const MONTH_ABBR = [
  'JAN',
  'FEV',
  'MAR',
  'ABR',
  'MAI',
  'JUN',
  'JUL',
  'AGO',
  'SET',
  'OUT',
  'NOV',
  'DEZ',
];
const MONTH_NAMES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

const stripAccents = (t: string) =>
  t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// 'OUT' | 'out' | 'outubro' | '10' | '010' -> 10; empty -> null; anything else -> unmatched marker.
export function parseMonthPart(
  input: string | null | undefined,
): number | string | null {
  const t = stripAccents((input ?? '').trim().toLowerCase());
  if (!t) return null;
  if (/^\d{1,2}$/.test(t)) {
    const n = Number(t);
    return n >= 1 && n <= 12 ? n : asUnmatched(input as string);
  }
  const byAbbr = MONTH_ABBR.findIndex((m) => m.toLowerCase() === t);
  if (byAbbr >= 0) return byAbbr + 1;
  const byName = MONTH_NAMES.findIndex((m) => stripAccents(m) === t);
  return byName >= 0 ? byName + 1 : asUnmatched(input as string);
}

// '2026' | '26' -> 2026; empty -> null; anything else -> unmatched marker.
export function parseYearPart(
  input: string | null | undefined,
): number | string | null {
  const t = (input ?? '').trim();
  if (!t) return null;
  if (!/^\d{2}$|^\d{4}$/.test(t)) return asUnmatched(t);
  const y = t.length === 2 ? 2000 + Number(t) : Number(t);
  return y >= 1990 && y <= 2100 ? y : asUnmatched(t);
}

export const formatMonthPart = (
  m: number | string | null | undefined,
): string =>
  typeof m === 'number'
    ? (MONTH_ABBR[m - 1] ?? '')
    : typeof m === 'string'
      ? `⚠ ${m.slice(2)}`
      : '';

export const formatYearPart = (
  y: number | string | null | undefined,
): string =>
  typeof y === 'number'
    ? String(y)
    : typeof y === 'string'
      ? `⚠ ${y.slice(2)}`
      : '';

// '2026-10-01' -> { month: 10, year: 2026 }
export function paymentParts(paymentMonth: string | null | undefined): {
  month: number | null;
  year: number | null;
} {
  if (!paymentMonth) return { month: null, year: null };
  const [y, m] = paymentMonth.split('-').map(Number);
  return { month: m, year: y };
}

// (10, 2026) -> '2026-10-01'; null unless both parts are real numbers.
export function composePaymentMonth(
  month: number | string | null | undefined,
  year: number | string | null | undefined,
): string | null {
  if (typeof month !== 'number' || typeof year !== 'number') return null;
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

// Date typed or pasted in a cell: empty -> null; a real date -> ISO; anything else -> marker.
export function parseDateCell(input: string | null | undefined): string | null {
  const t = (input ?? '').trim();
  if (!t) return null;
  return parseDateInput(t) ?? asUnmatched(t);
}

export const formatDateCell = (v: string | null | undefined): string =>
  !v ? '' : v.startsWith('?:') ? `⚠ ${v.slice(2)}` : formatDateBr(v);
