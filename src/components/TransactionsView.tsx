'use client';

import 'react-datasheet-grid/dist/style.css';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  createTextColumn,
  DataSheetGrid,
  isoDateColumn,
  keyColumn,
  textColumn,
  type Column,
} from 'react-datasheet-grid';

import {
  applyToInstallments,
  deleteTransactions,
  setTransactionAmount,
  updateTransactionFields,
  type CellPatch,
  type InstallmentScope,
} from '@/app/actions/transactions';
import { ConfirmRemove } from '@/components/InlineActions';
import { NewTransactionDialog } from '@/components/NewTransactionDialog';
import { selectColumn } from '@/components/grid/SelectColumn';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/card';
import { FormMessage, Input, Select } from '@/components/ui/field';
import {
  formatPaymentMonth,
  monthLabel,
  parsePaymentMonth,
  shiftMonth,
} from '@/lib/dates';
import { editableMoney, formatMoney, parseMoney } from '@/lib/money';
import type {
  AccountOption,
  LedgerOption,
  NamedOption,
  PersonOption,
  SplitDefault,
  TxRow,
} from '@/lib/transactions-types';

const FIELD_LABELS: Record<string, string> = {
  purchase_date: 'Data',
  payment_month: 'Mês de pagamento',
  description: 'Descrição',
  ledger_account_id: 'Título',
  envelope_id: 'Tipo',
  account_id: 'Conta',
  pay_to_person_id: 'Pagar para',
  amount_cents: 'Valor',
};
const PATCH_FIELDS = [
  'purchase_date',
  'payment_month',
  'description',
  'ledger_account_id',
  'envelope_id',
  'account_id',
  'pay_to_person_id',
] as const;
const REQUIRED = [
  'purchase_date',
  'payment_month',
  'ledger_account_id',
  'amount_cents',
];
// Fields the installment functions can apply to other installments.
const PROPAGATE = [
  'ledger_account_id',
  'envelope_id',
  'account_id',
  'pay_to_person_id',
  'amount_cents',
];

// The library does not export this type from its entry point.
type Operation = {
  type: 'UPDATE' | 'DELETE' | 'CREATE';
  fromRowIndex: number;
  toRowIndex: number;
};

type Prompt = { id: string; changes: Record<string, string | number | null> };

const moneyColumn = createTextColumn<number | null>({
  alignRight: true,
  continuousUpdates: false,
  deletedValue: null,
  parseUserInput: parseMoney,
  parsePastedValue: parseMoney,
  formatBlurredInput: formatMoney,
  formatInputOnFocus: editableMoney,
  formatForCopy: editableMoney,
});

const monthColumn = createTextColumn<string | null>({
  continuousUpdates: false,
  deletedValue: null,
  parseUserInput: parsePaymentMonth,
  parsePastedValue: parsePaymentMonth,
  formatBlurredInput: formatPaymentMonth,
  formatInputOnFocus: formatPaymentMonth,
  formatForCopy: formatPaymentMonth,
});

export function TransactionsView({
  workspaceId,
  month,
  initialRows,
  ledger,
  categories,
  envelopes,
  accounts,
  people,
  defaultSplit,
}: {
  workspaceId: string;
  month: string;
  initialRows: TxRow[];
  ledger: LedgerOption[];
  categories: NamedOption[];
  envelopes: NamedOption[];
  accounts: AccountOption[];
  people: PersonOption[];
  defaultSplit: SplitDefault[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(0);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [selection, setSelection] = useState<{
    from: number;
    to: number;
  } | null>(null);
  const [q, setQ] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const [ledgerFilter, setLedgerFilter] = useState('');
  const [deleteScope, setDeleteScope] = useState<InstallmentScope>('single');
  const [deleting, setDeleting] = useState(false);

  // Server data changed (navigation, router.refresh): adopt it.
  const [seen, setSeen] = useState(initialRows);
  if (seen !== initialRows) {
    setSeen(initialRows);
    setRows(initialRows);
  }

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!accountFilter || r.account_id === accountFilter) &&
        (!ledgerFilter || r.ledger_account_id === ledgerFilter) &&
        (!term || r.description.toLowerCase().includes(term)),
    );
  }, [rows, q, accountFilter, ledgerFilter]);

  const income = filtered.reduce(
    (s, r) => s + (r.amount_cents > 0 ? r.amount_cents : 0),
    0,
  );
  const expense = filtered.reduce(
    (s, r) => s + (r.amount_cents < 0 ? -r.amount_cents : 0),
    0,
  );

  const categoryOf = (ledgerId: string) => {
    const l = ledger.find((x) => x.id === ledgerId);
    return categories.find((c) => c.id === l?.category_id)?.name ?? '';
  };

  const columns = useMemo(() => {
    const opt = (list: NamedOption[]) =>
      list.map((n) => ({ value: n.id, label: n.name, archived: n.archived }));
    return [
      {
        ...keyColumn<TxRow, 'purchase_date'>(
          'purchase_date',
          isoDateColumn as Column,
        ),
        title: 'Data',
        minWidth: 130,
      },
      {
        ...keyColumn<TxRow, 'payment_month'>(
          'payment_month',
          monthColumn as Column,
        ),
        title: 'Pagamento',
        minWidth: 105,
      },
      {
        ...keyColumn<TxRow, 'description'>('description', textColumn as Column),
        title: 'Descrição',
        minWidth: 220,
        grow: 3,
      },
      {
        ...keyColumn<TxRow, 'ledger_account_id'>(
          'ledger_account_id',
          selectColumn(opt(ledger), false) as Column,
        ),
        title: 'Título',
        minWidth: 150,
        grow: 1,
      },
      {
        ...keyColumn<TxRow, 'envelope_id'>(
          'envelope_id',
          selectColumn(opt(envelopes), true) as Column,
        ),
        title: 'Tipo',
        minWidth: 120,
      },
      {
        id: 'category',
        title: 'Categoria',
        minWidth: 110,
        disabled: true,
        component: ({ rowData }: { rowData: TxRow }) => (
          <span className="truncate px-2 text-muted">
            {categoryOf(rowData.ledger_account_id)}
          </span>
        ),
        copyValue: ({ rowData }: { rowData: TxRow }) =>
          categoryOf(rowData.ledger_account_id),
      },
      {
        ...keyColumn<TxRow, 'account_id'>(
          'account_id',
          selectColumn(opt(accounts), true) as Column,
        ),
        title: 'Conta',
        minWidth: 130,
      },
      {
        id: 'shares',
        title: 'Dono',
        minWidth: 170,
        disabled: true,
        component: ({ rowData }: { rowData: TxRow }) => (
          <span className="truncate px-2 text-muted">{rowData.shares}</span>
        ),
        copyValue: ({ rowData }: { rowData: TxRow }) => rowData.shares,
      },
      {
        ...keyColumn<TxRow, 'pay_to_person_id'>(
          'pay_to_person_id',
          selectColumn(
            people.map((p) => ({
              value: p.id,
              label: p.name,
              archived: !p.active,
            })),
            true,
          ) as Column,
        ),
        title: 'Pagar para',
        minWidth: 120,
      },
      {
        ...keyColumn<TxRow, 'amount_cents'>(
          'amount_cents',
          moneyColumn as Column,
        ),
        title: 'Valor',
        minWidth: 120,
      },
    ] as Column<TxRow>[];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledger, categories, envelopes, accounts, people]);

  function patchRow(id: string, patch: Partial<TxRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  // Saves one edited row. Plain fields first, then the amount (which also re-splits).
  async function persist(oldRow: TxRow, newRow: TxRow) {
    const changed = [...PATCH_FIELDS, 'amount_cents' as const].filter(
      (k) => oldRow[k] !== newRow[k],
    );
    if (changed.length === 0) return;

    const missing = changed.find(
      (k) => REQUIRED.includes(k) && (newRow[k] == null || newRow[k] === 0),
    );
    if (missing) {
      patchRow(oldRow.id, oldRow);
      setError(
        `Valor inválido em "${FIELD_LABELS[missing]}". A alteração foi desfeita.`,
      );
      return;
    }

    setSaving((n) => n + 1);
    let stamp = oldRow.updated_at;
    try {
      const patch: Record<string, unknown> = {};
      for (const k of PATCH_FIELDS)
        if (changed.includes(k)) patch[k] = newRow[k];
      if (Object.keys(patch).length > 0) {
        const res = await updateTransactionFields(
          oldRow.id,
          patch as CellPatch,
          stamp,
        );
        if (!res.ok) throw new Error(res.error);
        stamp = res.updated_at;
      }
      if (changed.includes('amount_cents')) {
        const res = await setTransactionAmount(
          oldRow.id,
          newRow.amount_cents,
          stamp,
        );
        if (!res.ok) throw new Error(res.error);
        stamp = res.updated_at;
      }
      patchRow(oldRow.id, { updated_at: stamp });

      const propagate = changed.filter((k) => PROPAGATE.includes(k));
      if (newRow.installment_group_id && propagate.length > 0) {
        setPrompt({
          id: oldRow.id,
          changes: Object.fromEntries(
            propagate.map((k) => [
              k,
              newRow[k as keyof TxRow] as string | number | null,
            ]),
          ),
        });
      }
    } catch (e) {
      patchRow(oldRow.id, oldRow);
      setError(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setSaving((n) => n - 1);
    }
  }

  function onChange(newValue: TxRow[], operations: Operation[]) {
    const before = filtered;
    const updated = new Map<string, TxRow>();
    for (const op of operations) {
      if (op.type !== 'UPDATE') continue;
      for (let i = op.fromRowIndex; i < op.toRowIndex; i++) {
        if (before[i] && newValue[i]) updated.set(before[i].id, newValue[i]);
      }
    }
    if (updated.size === 0) return;
    setError(null);
    setPrompt(null);
    setRows((prev) => prev.map((r) => updated.get(r.id) ?? r));
    for (const [id, next] of updated) {
      const old = before.find((r) => r.id === id);
      if (old) void persist(old, next);
    }
  }

  async function applyScope(scope: InstallmentScope) {
    if (!prompt) return;
    const res = await applyToInstallments(prompt.id, scope, prompt.changes);
    if (!res.ok) setError(res.error);
    setPrompt(null);
    router.refresh();
  }

  const selectedRows = selection
    ? filtered.slice(selection.from, selection.to + 1)
    : [];
  const hasInstallments = selectedRows.some((r) => r.installment_group_id);

  async function removeSelected() {
    setDeleting(true);
    const res = await deleteTransactions(
      selectedRows.map((r) => r.id),
      hasInstallments ? deleteScope : 'single',
    );
    setDeleting(false);
    if (!res.ok) return setError(res.error);
    setSelection(null);
    router.refresh();
  }

  const prev = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);
  const gridHeight = Math.min(
    640,
    Math.max(220, (filtered.length + 1) * 36 + 44),
  );

  return (
    <>
      <PageHeader
        title="Lançamentos"
        actions={
          <Button onClick={() => setDialogOpen(true)}>Novo lançamento</Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <nav aria-label="Mês" className="flex items-center gap-1">
          <Link
            href={`/lancamentos?mes=${prev}`}
            aria-label="Mês anterior"
            className="rounded-lg px-3 py-1.5 hover:bg-line/60"
          >
            ←
          </Link>
          <span className="min-w-36 text-center font-medium">
            {monthLabel(month)}
          </span>
          <Link
            href={`/lancamentos?mes=${next}`}
            aria-label="Próximo mês"
            className="rounded-lg px-3 py-1.5 hover:bg-line/60"
          >
            →
          </Link>
        </nav>
        <dl className="ml-auto flex gap-5 text-sm">
          <div>
            <dt className="text-muted">Entradas</dt>
            <dd className="font-medium text-positive">{formatMoney(income)}</dd>
          </div>
          <div>
            <dt className="text-muted">Saídas</dt>
            <dd className="font-medium">{formatMoney(expense)}</dd>
          </div>
          <div>
            <dt className="text-muted">Saldo</dt>
            <dd className="font-medium">{formatMoney(income - expense)}</dd>
          </div>
        </dl>
      </div>

      <div className="mb-3 grid gap-2 sm:grid-cols-3">
        <Input
          placeholder="Buscar na descrição"
          aria-label="Buscar na descrição"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select
          aria-label="Filtrar por conta"
          value={accountFilter}
          onChange={(e) => setAccountFilter(e.target.value)}
        >
          <option value="">Todas as contas</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Filtrar por título"
          value={ledgerFilter}
          onChange={(e) => setLedgerFilter(e.target.value)}
        >
          <option value="">Todos os títulos</option>
          {ledger.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>
      </div>

      {error && (
        <div className="mb-3 flex items-start justify-between gap-3 rounded-lg bg-negative-tint px-3 py-2">
          <FormMessage>{error}</FormMessage>
          <Button variant="ghost" size="sm" onClick={() => setError(null)}>
            Fechar
          </Button>
        </div>
      )}
      {prompt && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-accent-tint px-3 py-2 text-sm text-accent-ink">
          <span>Aplicar essa alteração também às outras parcelas?</span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => applyScope('following')}
          >
            Às seguintes
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => applyScope('all')}
          >
            A todas
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPrompt(null)}>
            Só esta
          </Button>
        </div>
      )}
      {selectedRows.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">
            {selectedRows.length} selecionado(s)
          </span>
          {hasInstallments && (
            <Select
              aria-label="Escopo da exclusão"
              className="w-auto"
              value={deleteScope}
              onChange={(e) =>
                setDeleteScope(e.target.value as InstallmentScope)
              }
            >
              <option value="single">Só as selecionadas</option>
              <option value="following">Estas e as parcelas seguintes</option>
              <option value="all">Todo o parcelamento</option>
            </Select>
          )}
          <ConfirmRemove
            label="Excluir"
            pending={deleting}
            message="Excluir lançamentos?"
            onConfirm={removeSelected}
          />
        </div>
      )}

      <div className="tx-grid" aria-busy={saving > 0}>
        <DataSheetGrid<TxRow>
          value={filtered}
          columns={columns}
          onChange={onChange}
          lockRows
          addRowsComponent={false}
          height={gridHeight}
          rowHeight={36}
          rowKey="id"
          onSelectionChange={({ selection: s }) =>
            setSelection(s ? { from: s.min.row, to: s.max.row } : null)
          }
        />
      </div>
      <p className="mt-2 text-xs text-muted" aria-live="polite">
        {saving > 0 ? 'Salvando…' : 'Alterações são salvas automaticamente.'}{' '}
        Valores negativos são saídas.
      </p>
      {filtered.length === 0 && (
        <p className="mt-4 text-muted">
          Nenhum lançamento neste mês
          {rows.length > 0 ? ' com esses filtros' : ''}. Use “Novo lançamento”.
        </p>
      )}

      <NewTransactionDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        workspaceId={workspaceId}
        currentMonth={month}
        ledger={ledger}
        envelopes={envelopes}
        accounts={accounts}
        people={people}
        defaultSplit={defaultSplit}
      />
    </>
  );
}
