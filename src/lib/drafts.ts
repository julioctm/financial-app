import { composePaymentMonth, paymentParts } from '@/lib/dates';
import type { GridRow, LedgerOption, TxRow } from '@/lib/transactions-types';
import { isUnmatched, UNMATCHED_PREFIX, unmatchedText } from '@/lib/unmatched';

export { isUnmatched, UNMATCHED_PREFIX, unmatchedText };

// Drafts are new grid rows that exist only in the browser until they have everything a
// transaction needs. Pure helpers so the rules can be unit-tested.

export type DraftDefaults = { purchaseDate: string; paymentMonth: string };

// A new row is truly empty. Data and payment month are filled in with defaults (today and the
// month on screen) only when the row is saved, if the user left them empty.
export function blankDraft(id: string): GridRow {
  return {
    id,
    draft: true,
    purchase_date: null,
    payment_month: null,
    pm_month: null,
    pm_year: null,
    description: '',
    ledger_account_id: null,
    envelope_id: null,
    account_id: null,
    pay_to_person_id: null,
    owner_person_id: null,
    amount_cents: null,
    updated_at: '',
    installment_group_id: null,
    installment_number: null,
    split_percent: null,
  };
}

// Saved transaction -> grid row (adds the month/year columns).
export function toGridRow(r: TxRow): GridRow {
  const { month, year } = paymentParts(r.payment_month);
  return { ...r, pm_month: month, pm_year: year };
}

// The always-present empty row at the end of the grid: nothing typed at all.
export function isBlankDraft(d: GridRow): boolean {
  return (
    d.description === '' &&
    d.purchase_date == null &&
    d.pm_month == null &&
    d.pm_year == null &&
    d.ledger_account_id == null &&
    d.envelope_id == null &&
    d.account_id == null &&
    d.pay_to_person_id == null &&
    d.owner_person_id == null &&
    d.amount_cents == null
  );
}

// payment_month always follows the two month/year columns.
export function syncPaymentMonth(d: GridRow): GridRow {
  return { ...d, payment_month: composePaymentMonth(d.pm_month, d.pm_year) };
}

const REQUIRED_SELECTS: [keyof GridRow, string, string][] = [
  ['ledger_account_id', 'Título', 'o título'],
  ['owner_person_id', 'Dono', 'o dono'],
];
const OPTIONAL_SELECTS: [keyof GridRow, string][] = [
  ['account_id', 'Cartão'],
  ['envelope_id', 'Tipo'],
  ['pay_to_person_id', 'Pagar para'],
];

const bad = (label: string, v: string) =>
  `${label} “${unmatchedText(v)}” não encontrado`;

// What still prevents a draft from becoming a transaction, in plain Portuguese.
export function missingFields(d: GridRow): string[] {
  const out: string[] = [];
  for (const [key, label, what] of REQUIRED_SELECTS) {
    const v = d[key];
    if (isUnmatched(v)) out.push(bad(label, v));
    else if (!v) out.push(`falta ${what}`);
  }
  for (const [key, label] of OPTIONAL_SELECTS) {
    const v = d[key];
    if (isUnmatched(v)) out.push(bad(label, v));
  }
  if (isUnmatched(d.purchase_date))
    out.push(`Data “${unmatchedText(d.purchase_date)}” inválida`);
  if (isUnmatched(d.pm_month))
    out.push(`Mês “${unmatchedText(d.pm_month)}” inválido`);
  else if (d.pm_month == null && d.pm_year != null)
    out.push('falta o mês de pagamento');
  if (isUnmatched(d.pm_year))
    out.push(`Ano “${unmatchedText(d.pm_year)}” inválido`);
  else if (d.pm_year == null && d.pm_month != null)
    out.push('falta o ano de pagamento');
  if (d.amount_cents == null || d.amount_cents === 0) out.push('falta o valor');
  return out;
}

export const isComplete = (d: GridRow) => missingFields(d).length === 0;

// Empty date / payment month take the defaults (today / the month on screen).
export function withDefaults(d: GridRow, defaults: DraftDefaults): GridRow {
  return {
    ...d,
    purchase_date: d.purchase_date ?? defaults.purchaseDate,
    payment_month: d.payment_month ?? defaults.paymentMonth,
  };
}

// The title decides the direction of the money: income comes in, everything else goes out.
// (A negative number typed or pasted for an expense stays an expense.)
export function signedAmount(
  cents: number,
  kind: LedgerOption['kind'] | undefined,
): number {
  return kind === 'income' ? Math.abs(cents) : -Math.abs(cents);
}

// Keeps exactly one blank draft, always last. Rows that are still blank elsewhere in the
// list (e.g. a draft the user cleared) are dropped.
export function withTrailingBlank(
  drafts: GridRow[],
  newId: () => string,
): GridRow[] {
  const filled = drafts.filter((d) => !isBlankDraft(d));
  const blank = [...drafts].reverse().find((d) => isBlankDraft(d));
  return [...filled, blank ?? blankDraft(newId())];
}
