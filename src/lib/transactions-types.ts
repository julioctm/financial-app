export type TxRow = {
  id: string;
  purchase_date: string;
  payment_month: string; // YYYY-MM-01
  description: string;
  ledger_account_id: string;
  envelope_id: string | null;
  account_id: string | null;
  pay_to_person_id: string | null;
  amount_cents: number;
  updated_at: string;
  installment_group_id: string | null;
  installment_number: number | null;
  shares: string; // display only, e.g. "Ana 65% · Bruno 35%"
};

export type LedgerOption = {
  id: string;
  name: string;
  kind: 'income' | 'expense' | 'investment';
  category_id: string | null;
  default_envelope_id: string | null;
  archived: boolean;
};
export type NamedOption = { id: string; name: string; archived: boolean };
export type AccountOption = NamedOption & {
  closing_day: number | null;
  kind: 'credit_card' | 'checking' | 'cash' | 'other';
};
export type PersonOption = { id: string; name: string; active: boolean };
export type SplitDefault = { person_id: string; percent: number };
