'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';

import { createCatalogItem } from '@/app/actions/catalog';
import { createTransaction } from '@/app/actions/transactions';
import { Button } from '@/components/ui/button';
import { FormMessage, Input, Select } from '@/components/ui/field';
import { suggestPaymentMonth } from '@/lib/dates';
import { parseMoney } from '@/lib/money';
import type {
  AccountOption,
  LedgerOption,
  NamedOption,
  PersonOption,
  SplitDefault,
} from '@/lib/transactions-types';

const NEW = '__new__';

const ACCOUNT_KINDS: { value: AccountOption['kind']; label: string }[] = [
  { value: 'credit_card', label: 'Cartão de crédito' },
  { value: 'checking', label: 'Conta corrente' },
  { value: 'cash', label: 'Dinheiro' },
  { value: 'other', label: 'Outro' },
];
const LEDGER_KINDS: { value: LedgerOption['kind']; label: string }[] = [
  { value: 'expense', label: 'Despesa' },
  { value: 'income', label: 'Receita' },
  { value: 'investment', label: 'Investimento' },
];

function today(): string {
  return new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/Sao_Paulo',
  });
}

type QuickKind = 'account' | 'ledger' | 'envelope';

// Small inline form to create a catalog item without leaving the dialog.
function QuickCreate({
  kind,
  workspaceId,
  categories,
  envelopes,
  people,
  onCreated,
  onCancel,
}: {
  kind: QuickKind;
  workspaceId: string;
  categories: NamedOption[];
  envelopes: NamedOption[];
  people: PersonOption[];
  onCreated: (item: {
    id: string;
    name: string;
    values: Record<string, string>;
  }) => void;
  onCancel: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const table =
    kind === 'account'
      ? 'accounts'
      : kind === 'ledger'
        ? 'ledger_accounts'
        : 'envelopes';
  const title =
    kind === 'account'
      ? 'Nova conta ou cartão'
      : kind === 'ledger'
        ? 'Novo título'
        : 'Novo tipo';

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    e.stopPropagation(); // never submit the outer transaction form
    const values = Object.fromEntries(
      Array.from(new FormData(e.currentTarget).entries()).map(([k, v]) => [
        k,
        String(v),
      ]),
    );
    setError(null);
    start(async () => {
      const res = await createCatalogItem(table, workspaceId, values);
      if (!res.ok) return setError(res.error);
      onCreated({ id: res.id, name: values.name.trim(), values });
    });
  }

  return (
    <div className="space-y-3 rounded-lg bg-canvas p-3">
      <p className="text-sm font-medium">{title}</p>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-muted">Nome</span>
            <Input name="name" required maxLength={80} autoFocus />
          </label>
          {kind === 'account' && (
            <>
              <label className="space-y-1 text-sm">
                <span className="text-muted">Tipo da conta</span>
                <Select name="kind" defaultValue="credit_card">
                  {ACCOUNT_KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted">Dono (titular)</span>
                <Select name="holder_person_id" required defaultValue="">
                  <option value="">Escolha o dono…</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted">Dia de fechamento (opcional)</span>
                <Input name="closing_day" type="number" min={1} max={31} />
              </label>
            </>
          )}
          {kind === 'ledger' && (
            <>
              <label className="space-y-1 text-sm">
                <span className="text-muted">Natureza</span>
                <Select name="kind" defaultValue="expense">
                  {LEDGER_KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted">Categoria (opcional)</span>
                <Select name="category_id" defaultValue="">
                  <option value="">Nenhuma</option>
                  {categories
                    .filter((c) => !c.archived)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </Select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted">Tipo padrão (opcional)</span>
                <Select name="default_envelope_id" defaultValue="">
                  <option value="">Nenhum</option>
                  {envelopes
                    .filter((n) => !n.archived)
                    .map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.name}
                      </option>
                    ))}
                </Select>
              </label>
            </>
          )}
        </div>
        {error && <FormMessage>{error}</FormMessage>}
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={pending}>
            Criar e usar
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  );
}

export function NewTransactionDialog({
  open,
  onClose,
  workspaceId,
  currentMonth,
  ledger,
  categories,
  envelopes,
  accounts,
  people,
  defaultSplit,
}: {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  currentMonth: string;
  ledger: LedgerOption[];
  categories: NamedOption[];
  envelopes: NamedOption[];
  accounts: AccountOption[];
  people: PersonOption[];
  defaultSplit: SplitDefault[];
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Items created inside the dialog show up immediately, before the server data refreshes.
  const [extraAccounts, setExtraAccounts] = useState<AccountOption[]>([]);
  const [extraLedger, setExtraLedger] = useState<LedgerOption[]>([]);
  const [extraEnvelopes, setExtraEnvelopes] = useState<NamedOption[]>([]);
  const allAccounts = useMemo(
    () => [
      ...accounts,
      ...extraAccounts.filter((x) => !accounts.some((a) => a.id === x.id)),
    ],
    [accounts, extraAccounts],
  );
  const allLedger = useMemo(
    () => [
      ...ledger,
      ...extraLedger.filter((x) => !ledger.some((a) => a.id === x.id)),
    ],
    [ledger, extraLedger],
  );
  const allEnvelopes = useMemo(
    () => [
      ...envelopes,
      ...extraEnvelopes.filter((x) => !envelopes.some((a) => a.id === x.id)),
    ],
    [envelopes, extraEnvelopes],
  );
  const [creating, setCreating] = useState<QuickKind | null>(null);

  const activePeople = useMemo(() => people.filter((p) => p.active), [people]);
  const defaultShares = useMemo(
    () =>
      Object.fromEntries(
        activePeople.map((p) => [
          p.id,
          String(defaultSplit.find((s) => s.person_id === p.id)?.percent ?? 0),
        ]),
      ),
    [activePeople, defaultSplit],
  );
  const defaultSplitLabel = useMemo(() => {
    const parts = activePeople
      .map((p) => ({ name: p.name, pct: Number(defaultShares[p.id]) }))
      .filter((x) => x.pct > 0);
    return parts.length > 1
      ? parts.map((x) => `${x.name} ${x.pct}%`).join(' / ')
      : null;
  }, [activePeople, defaultShares]);

  const [purchaseDate, setPurchaseDate] = useState(today());
  const [paymentMonth, setPaymentMonth] = useState<string | null>(null); // null = follow suggestion
  const [accountId, setAccountId] = useState('');
  const [ledgerId, setLedgerId] = useState('');
  const [envelopeId, setEnvelopeId] = useState<string | null>(null); // null = follow title default
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [installments, setInstallments] = useState('1');
  const [amountIsTotal, setAmountIsTotal] = useState(true);
  const [payTo, setPayTo] = useState('');
  // Owner: 'default' (workspace split), a person id (100% theirs) or 'custom' (edit percentages).
  const [ownerMode, setOwnerMode] = useState('default');
  const [shares, setShares] = useState(defaultShares);

  const account = allAccounts.find((a) => a.id === accountId);
  const title = allLedger.find((l) => l.id === ledgerId);
  const suggested = suggestPaymentMonth(
    purchaseDate || today(),
    account?.closing_day ?? null,
  ).slice(0, 7);
  const monthValue = paymentMonth ?? suggested;
  const envelopeValue = envelopeId ?? title?.default_envelope_id ?? '';
  const total = Object.values(shares).reduce(
    (s, v) => s + (Number(v.replace(',', '.')) || 0),
    0,
  );
  const nInstallments = Number(installments) || 1;

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  function chooseOwner(mode: string) {
    setOwnerMode(mode);
    if (mode === 'default') setShares(defaultShares);
    else if (mode !== 'custom')
      setShares(
        Object.fromEntries(
          activePeople.map((p) => [p.id, p.id === mode ? '100' : '0']),
        ),
      );
  }

  function reset() {
    setPurchaseDate(today());
    setPaymentMonth(null);
    setAccountId('');
    setLedgerId('');
    setEnvelopeId(null);
    setDescription('');
    setAmount('');
    setInstallments('1');
    setAmountIsTotal(true);
    setPayTo('');
    setOwnerMode('default');
    setShares(defaultShares);
    setCreating(null);
    setError(null);
  }

  // Picking "+ Nova…" in a select opens the inline form instead of changing the value.
  function onPick(kind: QuickKind, set: (v: string) => void) {
    return (e: React.ChangeEvent<HTMLSelectElement>) => {
      if (e.target.value === NEW) setCreating(kind);
      else set(e.target.value);
    };
  }

  function onCreated(
    kind: QuickKind,
    item: { id: string; name: string; values: Record<string, string> },
  ) {
    if (kind === 'account') {
      setExtraAccounts((l) => [
        ...l,
        {
          id: item.id,
          name: item.name,
          archived: false,
          kind: (item.values.kind as AccountOption['kind']) ?? 'credit_card',
          closing_day: item.values.closing_day
            ? Number(item.values.closing_day)
            : null,
        },
      ]);
      setAccountId(item.id);
    } else if (kind === 'ledger') {
      setExtraLedger((l) => [
        ...l,
        {
          id: item.id,
          name: item.name,
          archived: false,
          kind: (item.values.kind as LedgerOption['kind']) ?? 'expense',
          category_id: item.values.category_id || null,
          default_envelope_id: item.values.default_envelope_id || null,
        },
      ]);
      setLedgerId(item.id);
      setEnvelopeId(null);
    } else {
      setExtraEnvelopes((l) => [
        ...l,
        { id: item.id, name: item.name, archived: false },
      ]);
      setEnvelopeId(item.id);
    }
    setCreating(null);
    router.refresh();
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const cents = parseMoney(amount);
    if (!ledgerId) return setError('Escolha um título.');
    if (cents == null || cents === 0)
      return setError('Informe um valor válido.');
    if (Math.abs(total - 100) > 0.001)
      return setError('O rateio precisa somar 100%.');
    if (
      !Number.isInteger(nInstallments) ||
      nInstallments < 1 ||
      nInstallments > 120
    )
      return setError('Parcelas deve ser um número de 1 a 120.');

    // The title decides the sign: income is positive, everything else is an outflow.
    const signed =
      title?.kind === 'income' ? Math.abs(cents) : -Math.abs(cents);

    start(async () => {
      const res = await createTransaction({
        workspaceId,
        purchaseDate,
        paymentMonth: `${monthValue}-01`,
        accountId: accountId || null,
        ledgerAccountId: ledgerId,
        envelopeId: envelopeValue || null,
        description,
        amountCents: signed,
        payToPersonId: payTo || null,
        shares: activePeople
          .map((p) => ({
            person_id: p.id,
            percent: Number(shares[p.id].replace(',', '.')) || 0,
          }))
          .filter((s) => s.percent > 0),
        installments: nInstallments,
        amountIsTotal,
      });
      if (!res.ok) return setError(res.error);
      reset();
      onClose();
      if (monthValue !== currentMonth)
        router.push(`/lancamentos?mes=${monthValue}`);
      else router.refresh();
    });
  }

  const quick = (kind: QuickKind) =>
    creating === kind ? (
      <div className="sm:col-span-2">
        <QuickCreate
          kind={kind}
          workspaceId={workspaceId}
          categories={categories}
          envelopes={allEnvelopes}
          people={activePeople}
          onCreated={(item) => onCreated(kind, item)}
          onCancel={() => setCreating(null)}
        />
      </div>
    ) : null;

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="w-[min(36rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-0 text-ink backdrop:bg-ink/35"
    >
      <form
        onSubmit={submit}
        className="max-h-[88vh] space-y-4 overflow-y-auto p-5"
      >
        <div className="flex items-center justify-between">
          <h2>Novo lançamento</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Fechar
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-muted">Data da compra</span>
            <Input
              type="date"
              required
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted">Mês de pagamento</span>
            <Input
              type="month"
              required
              value={monthValue}
              onChange={(e) => setPaymentMonth(e.target.value)}
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="text-muted">Conta / cartão</span>
            <Select
              value={accountId}
              onChange={onPick('account', setAccountId)}
            >
              <option value="">Nenhuma</option>
              {allAccounts
                .filter((a) => !a.archived)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} (
                    {ACCOUNT_KINDS.find(
                      (k) => k.value === a.kind,
                    )?.label.toLowerCase()}
                    )
                  </option>
                ))}
              <option value={NEW}>+ Nova conta ou cartão…</option>
            </Select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted">Título</span>
            <Select
              required
              value={ledgerId}
              onChange={onPick('ledger', (v) => {
                setLedgerId(v);
                setEnvelopeId(null);
              })}
            >
              <option value="">Escolha…</option>
              {allLedger
                .filter((l) => !l.archived)
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              <option value={NEW}>+ Novo título…</option>
            </Select>
          </label>
          {quick('account')}
          {quick('ledger')}

          <label className="space-y-1 text-sm">
            <span className="text-muted">Tipo</span>
            <Select
              value={envelopeValue}
              onChange={onPick('envelope', setEnvelopeId)}
            >
              <option value="">Nenhum</option>
              {allEnvelopes
                .filter((n) => !n.archived)
                .map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              <option value={NEW}>+ Novo tipo…</option>
            </Select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted">Pagar para (quem adiantou)</span>
            <Select value={payTo} onChange={(e) => setPayTo(e.target.value)}>
              <option value="">Ninguém</option>
              {activePeople.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </label>
          {quick('envelope')}
        </div>

        <label className="block space-y-1 text-sm">
          <span className="text-muted">Descrição</span>
          <Input
            maxLength={200}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-muted">
              Valor{' '}
              {title
                ? `(${title.kind === 'income' ? 'entrada' : 'saída'})`
                : ''}
            </span>
            <Input
              inputMode="decimal"
              required
              placeholder="0,00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted">Parcelas</span>
            <Input
              type="number"
              min={1}
              max={120}
              value={installments}
              onChange={(e) => setInstallments(e.target.value)}
            />
          </label>
        </div>
        {nInstallments > 1 && (
          <fieldset className="flex flex-wrap gap-4 text-sm">
            <legend className="sr-only">O valor informado é</legend>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={amountIsTotal}
                onChange={() => setAmountIsTotal(true)}
                className="accent-accent"
              />
              Valor total
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={!amountIsTotal}
                onChange={() => setAmountIsTotal(false)}
                className="accent-accent"
              />
              Valor de cada parcela
            </label>
          </fieldset>
        )}

        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm text-muted">
            De quem é este gasto (dono)
          </legend>
          <Select
            aria-label="Dono do lançamento"
            value={ownerMode}
            onChange={(e) => chooseOwner(e.target.value)}
          >
            {defaultSplitLabel && (
              <option value="default">
                Dividido pelo rateio padrão ({defaultSplitLabel})
              </option>
            )}
            {!defaultSplitLabel && (
              <option value="default">Rateio padrão</option>
            )}
            {activePeople.map((p) => (
              <option key={p.id} value={p.id}>
                Somente {p.name}
              </option>
            ))}
            <option value="custom">Personalizado…</option>
          </Select>
          {ownerMode === 'custom' && (
            <div className="space-y-2 rounded-lg bg-canvas p-3">
              {activePeople.map((p) => (
                <label
                  key={p.id}
                  className="flex items-center justify-between gap-4 text-sm"
                >
                  <span>{p.name}</span>
                  <span className="flex items-center gap-1">
                    <Input
                      inputMode="decimal"
                      aria-label={`Percentual de ${p.name}`}
                      className="w-24 text-right"
                      value={shares[p.id]}
                      onChange={(e) =>
                        setShares((s) => ({ ...s, [p.id]: e.target.value }))
                      }
                    />
                    %
                  </span>
                </label>
              ))}
              <p
                className={`text-sm ${Math.abs(total - 100) < 0.001 ? 'text-positive' : 'text-negative'}`}
              >
                Total: {total.toFixed(2)}%
              </p>
            </div>
          )}
        </fieldset>

        {error && <FormMessage>{error}</FormMessage>}
        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? 'Salvando…' : 'Salvar lançamento'}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </form>
    </dialog>
  );
}
