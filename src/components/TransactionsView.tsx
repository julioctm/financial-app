'use client';

import 'react-datasheet-grid/dist/style.css';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import {
  createTextColumn,
  DynamicDataSheetGrid as DataSheetGrid,
  keyColumn,
  type Column,
} from 'react-datasheet-grid';

import {
  applyToInstallments,
  createTransaction,
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
  formatDateBr,
  formatPaymentMonth,
  monthLabel,
  parseDateInput,
  parsePaymentMonth,
  shiftMonth,
  todayIso,
} from '@/lib/dates';
import {
  blankDraft,
  isBlankDraft,
  isUnmatched,
  missingFields,
  signedAmount,
  unmatchedText,
  withTrailingBlank,
  type DraftDefaults,
} from '@/lib/drafts';
import {
  editableMoney,
  formatMoney,
  formatPercent,
  parseMoney,
} from '@/lib/money';
import type {
  AccountOption,
  LedgerOption,
  NamedOption,
  PersonOption,
  GridRow,
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
  owner_person_id: 'Dono',
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
  'owner_person_id',
] as const;
const REQUIRED = [
  'owner_person_id',
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

// Commit on blur/Enter (not per keystroke): every commit is a server write guarded by
// the row version, so per-keystroke writes would conflict with each other.
const descriptionColumn = createTextColumn<string>({
  continuousUpdates: false,
  deletedValue: '',
  parseUserInput: (v) => v.trim(),
  parsePastedValue: (v) => v.replace(/[\n\r]+/g, ' ').trim(),
  formatBlurredInput: (v) => v ?? '',
  formatInputOnFocus: (v) => v ?? '',
  formatForCopy: (v) => v ?? '',
});

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

// Typed or pasted as dd/mm/aaaa (what a spreadsheet copies); stored as ISO.
const dateColumn = createTextColumn<string | null>({
  continuousUpdates: false,
  deletedValue: null,
  parseUserInput: parseDateInput,
  parsePastedValue: parseDateInput,
  formatBlurredInput: formatDateBr,
  formatInputOnFocus: formatDateBr,
  formatForCopy: formatDateBr,
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
  // Drafts: new rows that live only in the browser until they have everything a transaction
  // needs. The grid always ends with one blank draft, where you type or paste new rows.
  const idCounter = useRef(0);
  const newDraftId = () => `draft-${++idCounter.current}`;
  const defaultsFor = (m: string): DraftDefaults => ({
    purchaseDate: todayIso(),
    paymentMonth: `${m}-01`,
  });
  const defaults = useMemo(() => defaultsFor(month), [month]);
  const [drafts, setDrafts] = useState<GridRow[]>(() => [
    blankDraft(`draft-${++idCounter.current}`, defaultsFor(month)),
  ]);
  const [draftErrors, setDraftErrors] = useState<Record<string, string>>({});
  const savingDrafts = useRef(new Set<string>()); // guards against saving a draft twice
  const savedDrafts = useRef(new Set<string>()); // saved; removed once the server data arrives
  const [notice, setNotice] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(0);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  // Selected row ids. The grid reports `null` when focus moves outside it (e.g. when the
  // user clicks the Excluir button), so that is ignored: the selection stays until it is
  // explicitly cleared, deleted, or the month changes.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const [ledgerFilter, setLedgerFilter] = useState('');
  const [deleteScope, setDeleteScope] = useState<InstallmentScope>('single');
  const [deleting, setDeleting] = useState(false);

  // Server data changed (navigation, router.refresh): adopt it.
  const [seen, setSeen] = useState(initialRows);
  const [seenMonth, setSeenMonth] = useState(month);
  if (seen !== initialRows) {
    setSeen(initialRows);
    setRows(initialRows);
    setSelectedIds((ids) =>
      ids.filter((id) => initialRows.some((r) => r.id === id)),
    );
    // Drafts that were saved now exist as real rows.
    if (savedDrafts.current.size > 0) {
      const done = new Set(savedDrafts.current);
      savedDrafts.current.clear();
      done.forEach((id) => savingDrafts.current.delete(id));
      setDrafts((d) =>
        withTrailingBlank(
          d.filter((x) => !done.has(x.id)),
          defaults,
          newDraftId,
        ),
      );
    }
  }
  if (seenMonth !== month) {
    // New month: unsaved drafts do not follow you.
    setSeenMonth(month);
    setDrafts([blankDraft(newDraftId(), defaultsFor(month))]);
    setDraftErrors({});
    setNotice(null);
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

  const categoryOf = (ledgerId: string | null) => {
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
          dateColumn as Column,
        ),
        title: 'Data',
        minWidth: 110,
      },
      {
        ...keyColumn<TxRow, 'payment_month'>(
          'payment_month',
          monthColumn as Column,
        ),
        title: 'Pagamento',
        minWidth: 95,
      },
      {
        ...keyColumn<TxRow, 'description'>(
          'description',
          descriptionColumn as Column,
        ),
        title: 'Descrição',
        minWidth: 190,
        grow: 3,
      },
      {
        ...keyColumn<TxRow, 'ledger_account_id'>(
          'ledger_account_id',
          selectColumn(opt(ledger), false) as Column,
        ),
        title: 'Título',
        minWidth: 140,
        grow: 1,
      },
      {
        ...keyColumn<TxRow, 'amount_cents'>(
          'amount_cents',
          moneyColumn as Column,
        ),
        title: 'Valor',
        minWidth: 110,
      },
      {
        ...keyColumn<TxRow, 'account_id'>(
          'account_id',
          selectColumn(opt(accounts), true) as Column,
        ),
        title: 'Conta / cartão',
        minWidth: 130,
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
        ...keyColumn<TxRow, 'owner_person_id'>(
          'owner_person_id',
          selectColumn(
            people.map((p) => ({
              value: p.id,
              label: p.name,
              archived: !p.active,
            })),
            false,
          ) as Column,
        ),
        title: 'Dono',
        minWidth: 110,
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
        id: 'split',
        title: 'Divisão',
        minWidth: 80,
        disabled: true,
        component: ({ rowData }: { rowData: GridRow }) => (
          <span className="truncate px-2 text-muted">
            {formatPercent(rowData.split_percent)}
          </span>
        ),
        copyValue: ({ rowData }: { rowData: GridRow }) =>
          formatPercent(rowData.split_percent),
      },
      {
        id: 'category',
        title: 'Categoria',
        minWidth: 110,
        disabled: true,
        component: ({ rowData }: { rowData: GridRow }) => (
          <span className="truncate px-2 text-muted">
            {categoryOf(rowData.ledger_account_id)}
          </span>
        ),
        copyValue: ({ rowData }: { rowData: GridRow }) =>
          categoryOf(rowData.ledger_account_id),
      },
    ] as Column[];
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

  function onChange(newValue: GridRow[], operations: Operation[]) {
    const nReal = filtered.length;
    // Saved rows are deleted only through the Excluir button (it asks for confirmation).
    if (
      newValue.length < nReal ||
      operations.some((op) => op.type === 'DELETE' && op.fromRowIndex < nReal)
    ) {
      setError(
        'Para excluir lançamentos, selecione a linha e use o botão Excluir.',
      );
      return;
    }

    // 1) Saved rows
    const before = filtered;
    const updated = new Map<string, TxRow>();
    for (const op of operations) {
      if (op.type !== 'UPDATE') continue;
      for (let i = op.fromRowIndex; i < Math.min(op.toRowIndex, nReal); i++) {
        if (before[i] && newValue[i])
          updated.set(before[i].id, newValue[i] as TxRow);
      }
    }
    for (const [id, next] of [...updated]) {
      const bad = Object.entries(next).find(([, v]) => isUnmatched(v));
      if (bad) {
        setError(
          `${FIELD_LABELS[bad[0]] ?? bad[0]} “${unmatchedText(bad[1] as string)}” não encontrado nos cadastros. A alteração foi desfeita.`,
        );
        updated.delete(id);
      }
    }
    if (updated.size > 0) {
      setError(null);
      setPrompt(null);
      setRows((prev) => prev.map((r) => updated.get(r.id) ?? r));
      for (const [id, next] of updated) {
        const old = before.find((r) => r.id === id);
        if (old) void persist(old, next);
      }
    }

    // 2) Drafts: everything after the saved rows
    const incoming = newValue.slice(nReal).map((r) =>
      String(r.id).startsWith('draft-')
        ? { ...r, draft: true }
        : // a duplicated saved row: it becomes a new draft
          {
            ...r,
            id: newDraftId(),
            draft: true,
            updated_at: '',
            installment_group_id: null,
            installment_number: null,
            split_percent: null,
          },
    );
    const nextDrafts = withTrailingBlank(incoming, defaults, newDraftId);
    setDrafts(nextDrafts);
    for (const d of nextDrafts) {
      if (missingFields(d).length === 0) void saveDraft(d);
    }
  }

  // A draft with title, owner and value becomes a real transaction on its own.
  async function saveDraft(d: GridRow) {
    if (savingDrafts.current.has(d.id)) return;
    savingDrafts.current.add(d.id);
    const title = ledger.find((l) => l.id === d.ledger_account_id);
    setDraftErrors((e) =>
      Object.fromEntries(Object.entries(e).filter(([id]) => id !== d.id)),
    );
    setSaving((n) => n + 1);
    try {
      const res = await createTransaction({
        workspaceId,
        purchaseDate: d.purchase_date as string,
        paymentMonth: d.payment_month as string,
        accountId: d.account_id,
        ledgerAccountId: d.ledger_account_id as string,
        envelopeId: d.envelope_id ?? title?.default_envelope_id ?? null,
        description: d.description,
        amountCents: signedAmount(d.amount_cents as number, title?.kind),
        payToPersonId: d.pay_to_person_id,
        shares: [{ person_id: d.owner_person_id as string, percent: 100 }],
        installments: 1,
        amountIsTotal: true,
      });
      if (!res.ok) {
        savingDrafts.current.delete(d.id);
        setDraftErrors((e) => ({ ...e, [d.id]: res.error }));
        return;
      }
      savedDrafts.current.add(d.id);
      if (d.payment_month !== `${month}-01`) {
        setNotice(
          `Lançamento criado em ${formatPaymentMonth(d.payment_month)} (outro mês).`,
        );
      }
      router.refresh();
    } catch {
      savingDrafts.current.delete(d.id);
      setDraftErrors((e) => ({
        ...e,
        [d.id]: 'Não foi possível salvar. Tente novamente.',
      }));
    } finally {
      setSaving((n) => n - 1);
    }
  }

  async function applyScope(scope: InstallmentScope) {
    if (!prompt) return;
    const res = await applyToInstallments(prompt.id, scope, prompt.changes);
    if (!res.ok) setError(res.error);
    setPrompt(null);
    router.refresh();
  }

  const selectedRows = rows.filter((r) => selectedIds.includes(r.id));
  // Rows that belong to a larger purchase (installment plan or split between owners).
  const hasInstallments = selectedRows.some(
    (r) => r.installment_group_id || r.split_percent != null,
  );

  async function removeSelected() {
    setDeleting(true);
    const res = await deleteTransactions(
      selectedRows.map((r) => r.id),
      hasInstallments ? deleteScope : 'single',
    );
    setDeleting(false);
    if (!res.ok) return setError(res.error);
    setSelectedIds([]);
    router.refresh();
  }

  const incompleteDrafts = drafts
    .filter((d) => !isBlankDraft(d, defaults))
    .map((row) => ({ row, problems: missingFields(row) }))
    .filter((x) => x.problems.length > 0 || draftErrors[x.row.id]);
  const gridValue = useMemo(() => [...filtered, ...drafts], [filtered, drafts]);
  const prev = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);
  const gridHeight = Math.min(
    640,
    Math.max(220, (gridValue.length + 1) * 36 + 44),
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
          <option value="">Todas as contas e cartões</option>
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
      {notice && (
        <div className="mb-3 flex items-start justify-between gap-3 rounded-lg bg-accent-tint px-3 py-2 text-sm text-accent-ink">
          <span>{notice}</span>
          <Button variant="ghost" size="sm" onClick={() => setNotice(null)}>
            Fechar
          </Button>
        </div>
      )}
      {incompleteDrafts.length > 0 && (
        <div
          className="mb-3 space-y-1 rounded-lg bg-accent-tint px-3 py-2 text-sm text-accent-ink"
          role="status"
        >
          <div className="flex items-center justify-between gap-3">
            <strong className="font-medium">
              {incompleteDrafts.length}{' '}
              {incompleteDrafts.length === 1
                ? 'linha incompleta'
                : 'linhas incompletas'}{' '}
              (ainda não salvas)
            </strong>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDrafts([blankDraft(newDraftId(), defaults)]);
                setDraftErrors({});
              }}
            >
              Descartar
            </Button>
          </div>
          <ul className="list-disc pl-5">
            {incompleteDrafts.slice(0, 5).map(({ row, problems }) => (
              <li key={row.id}>
                Linha {gridValue.findIndex((g) => g.id === row.id) + 1}:{' '}
                {draftErrors[row.id] ?? problems.join(', ')}
              </li>
            ))}
            {incompleteDrafts.length > 5 && (
              <li>e mais {incompleteDrafts.length - 5}…</li>
            )}
          </ul>
        </div>
      )}
      {prompt && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-accent-tint px-3 py-2 text-sm text-accent-ink">
          <span>
            Aplicar essa alteração também às outras parcelas desta linha?
          </span>
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
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])}>
            Limpar seleção
          </Button>
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
              <option value="following">
                Estas e as parcelas seguintes (todos os donos)
              </option>
              <option value="all">
                Toda a compra (todos os donos e parcelas)
              </option>
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
        <DataSheetGrid<GridRow>
          // The static grid variant freezes callbacks and columns after the first render, which
          // breaks selection and edits as data changes; the dynamic one re-renders with props.
          // Keyed by month so navigating resets its internal selection.
          key={month}
          value={gridValue}
          columns={columns}
          onChange={onChange}
          createRow={() => blankDraft(newDraftId(), defaults)}
          // Rows are created by typing/pasting into the blank row and removed with Excluir.
          disableContextMenu
          rowClassName={({ rowData }) =>
            rowData.draft ? 'dsg-draft-row' : undefined
          }
          addRowsComponent={false}
          height={gridHeight}
          rowHeight={36}
          rowKey="id"
          onSelectionChange={({ selection: s }) => {
            if (!s) return;
            setSelectedIds(
              filtered.slice(s.min.row, s.max.row + 1).map((r) => r.id),
            );
          }}
        />
      </div>
      <p className="mt-2 text-xs text-muted" aria-live="polite">
        {saving > 0 ? 'Salvando…' : 'Alterações são salvas automaticamente.'}{' '}
        Valores negativos são saídas.
      </p>
      {filtered.length === 0 && (
        <p className="mt-4 text-muted">
          Nenhum lançamento neste mês
          {rows.length > 0 ? ' com esses filtros' : ''}. Preencha a linha em
          branco da tabela, cole linhas do Sheets ou use “Novo lançamento”.
        </p>
      )}

      <NewTransactionDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        workspaceId={workspaceId}
        currentMonth={month}
        ledger={ledger}
        categories={categories}
        envelopes={envelopes}
        accounts={accounts}
        people={people}
        defaultSplit={defaultSplit}
      />
    </>
  );
}
