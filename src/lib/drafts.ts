import type { GridRow, LedgerOption } from '@/lib/transactions-types';

// Drafts are new grid rows that exist only in the browser until they have everything a
// transaction needs. Pure helpers so the rules can be unit-tested.

// A pasted/typed select value that matched nothing is kept as '?:<text>' so the user can
// see what was not found (instead of the cell silently staying empty).
export const UNMATCHED_PREFIX = '?:';
export const isUnmatched = (v: unknown): v is string =>
  typeof v === 'string' && v.startsWith(UNMATCHED_PREFIX);
export const unmatchedText = (v: string) => v.slice(UNMATCHED_PREFIX.length);

export type DraftDefaults = { purchaseDate: string; paymentMonth: string };

export function blankDraft(id: string, defaults: DraftDefaults): GridRow {
  return {
    id,
    draft: true,
    purchase_date: defaults.purchaseDate,
    payment_month: defaults.paymentMonth,
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

// The always-present empty row at the end of the grid: nothing typed beyond the defaults.
export function isBlankDraft(d: GridRow, defaults: DraftDefaults): boolean {
  return (
    d.description === '' &&
    d.ledger_account_id == null &&
    d.envelope_id == null &&
    d.account_id == null &&
    d.pay_to_person_id == null &&
    d.owner_person_id == null &&
    d.amount_cents == null &&
    (d.purchase_date == null || d.purchase_date === defaults.purchaseDate) &&
    (d.payment_month == null || d.payment_month === defaults.paymentMonth)
  );
}

const REQUIRED_SELECTS: [keyof GridRow, string, string][] = [
  ['ledger_account_id', 'Título', 'o título'],
  ['owner_person_id', 'Dono', 'o dono'],
];
const OPTIONAL_SELECTS: [keyof GridRow, string][] = [
  ['account_id', 'Conta'],
  ['envelope_id', 'Tipo'],
  ['pay_to_person_id', 'Pagar para'],
];

// What still prevents a draft from becoming a transaction, in plain Portuguese.
export function missingFields(d: GridRow): string[] {
  const out: string[] = [];
  for (const [key, label, what] of REQUIRED_SELECTS) {
    const v = d[key];
    if (isUnmatched(v))
      out.push(`${label} “${unmatchedText(v)}” não encontrado`);
    else if (!v) out.push(`falta ${what}`);
  }
  for (const [key, label] of OPTIONAL_SELECTS) {
    const v = d[key];
    if (isUnmatched(v))
      out.push(`${label} “${unmatchedText(v)}” não encontrado`);
  }
  if (!d.purchase_date) out.push('falta a data');
  if (!d.payment_month) out.push('falta o mês de pagamento');
  if (d.amount_cents == null || d.amount_cents === 0) out.push('falta o valor');
  return out;
}

export const isComplete = (d: GridRow) => missingFields(d).length === 0;

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
  defaults: DraftDefaults,
  newId: () => string,
): GridRow[] {
  const filled = drafts.filter((d) => !isBlankDraft(d, defaults));
  const blank = [...drafts].reverse().find((d) => isBlankDraft(d, defaults));
  return [...filled, blank ?? blankDraft(newId(), defaults)];
}
