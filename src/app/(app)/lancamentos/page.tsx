import { TransactionsView } from '@/components/TransactionsView';
import { currentMonthKey, isMonthKey } from '@/lib/dates';
import { requireProfile } from '@/lib/profile';
import { createClient } from '@/lib/supabase/server';
import type {
  AccountOption,
  LedgerOption,
  NamedOption,
  PersonOption,
  SplitDefault,
  TxRow,
} from '@/lib/transactions-types';
import { requireWorkspace } from '@/lib/workspace';

type DbRow = Omit<TxRow, 'shares'> & {
  transaction_shares: { person_id: string; percent: number }[];
};

export default async function LancamentosPage({
  searchParams,
}: {
  searchParams: { mes?: string };
}) {
  await requireProfile('/lancamentos');
  const { active } = await requireWorkspace();
  const month = isMonthKey(searchParams.mes)
    ? searchParams.mes
    : currentMonthKey();
  const supabase = createClient();
  const ws = active.id;

  const [tx, ledger, categories, envelopes, accounts, people, split] =
    await Promise.all([
      supabase
        .from('transactions')
        .select(
          'id, purchase_date, payment_month, description, ledger_account_id, envelope_id, account_id, pay_to_person_id, amount_cents, updated_at, installment_group_id, installment_number, transaction_shares(person_id, percent)',
        )
        .eq('workspace_id', ws)
        .eq('payment_month', `${month}-01`)
        .order('purchase_date')
        .order('created_at')
        .limit(2000),
      supabase
        .from('ledger_accounts')
        .select('id, name, kind, category_id, default_envelope_id, archived_at')
        .eq('workspace_id', ws)
        .order('name'),
      supabase
        .from('categories')
        .select('id, name, archived_at')
        .eq('workspace_id', ws),
      supabase
        .from('envelopes')
        .select('id, name, archived_at')
        .eq('workspace_id', ws)
        .order('name'),
      supabase
        .from('accounts')
        .select('id, name, closing_day, archived_at')
        .eq('workspace_id', ws)
        .order('name'),
      supabase
        .from('people')
        .select('id, display_name, is_active')
        .eq('workspace_id', ws)
        .order('display_name'),
      supabase
        .from('workspace_split_defaults')
        .select('person_id, percent')
        .eq('workspace_id', ws),
    ]);

  const peopleOptions: PersonOption[] = (people.data ?? []).map((p) => ({
    id: p.id as string,
    name: p.display_name as string,
    active: p.is_active as boolean,
  }));
  const nameOf = (id: string) =>
    peopleOptions.find((p) => p.id === id)?.name ?? '?';

  const rows: TxRow[] = ((tx.data ?? []) as unknown as DbRow[]).map((r) => {
    const { transaction_shares, ...rest } = r;
    return {
      ...rest,
      amount_cents: Number(r.amount_cents),
      shares: [...transaction_shares]
        .sort((a, b) => Number(b.percent) - Number(a.percent))
        .map((s) => `${nameOf(s.person_id)} ${Number(s.percent)}%`)
        .join(' · '),
    };
  });

  const named = (
    rows: { id: unknown; name: unknown; archived_at: unknown }[] | null,
  ): NamedOption[] =>
    (rows ?? []).map((r) => ({
      id: String(r.id),
      name: String(r.name),
      archived: r.archived_at != null,
    }));

  return (
    <TransactionsView
      workspaceId={ws}
      month={month}
      initialRows={rows}
      ledger={(ledger.data ?? []).map((l) => ({
        id: l.id as string,
        name: l.name as string,
        kind: l.kind as LedgerOption['kind'],
        category_id: (l.category_id as string | null) ?? null,
        default_envelope_id: (l.default_envelope_id as string | null) ?? null,
        archived: l.archived_at != null,
      }))}
      categories={named(categories.data)}
      envelopes={named(envelopes.data)}
      accounts={(accounts.data ?? []).map((a): AccountOption => ({
        id: a.id as string,
        name: a.name as string,
        closing_day: (a.closing_day as number | null) ?? null,
        archived: a.archived_at != null,
      }))}
      people={peopleOptions}
      defaultSplit={(
        (split.data ?? []) as { person_id: string; percent: number }[]
      ).map((s): SplitDefault => ({
        person_id: s.person_id,
        percent: Number(s.percent),
      }))}
    />
  );
}
