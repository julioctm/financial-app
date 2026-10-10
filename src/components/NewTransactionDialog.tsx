'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';

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

function today(): string {
  return new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/Sao_Paulo',
  });
}

export function NewTransactionDialog({
  open,
  onClose,
  workspaceId,
  currentMonth,
  ledger,
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
  envelopes: NamedOption[];
  accounts: AccountOption[];
  people: PersonOption[];
  defaultSplit: SplitDefault[];
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const activePeople = useMemo(() => people.filter((p) => p.active), [people]);
  const initialShares = useMemo(
    () =>
      Object.fromEntries(
        activePeople.map((p) => [
          p.id,
          String(defaultSplit.find((s) => s.person_id === p.id)?.percent ?? 0),
        ]),
      ),
    [activePeople, defaultSplit],
  );

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
  const [shares, setShares] = useState(initialShares);

  const account = accounts.find((a) => a.id === accountId);
  const title = ledger.find((l) => l.id === ledgerId);
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
    setShares(initialShares);
    setError(null);
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

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="w-[min(34rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-0 text-ink backdrop:bg-ink/35"
    >
      <form
        onSubmit={submit}
        className="max-h-[85vh] space-y-4 overflow-y-auto p-5"
      >
        <div className="flex items-center justify-between">
          <h2>Novo lançamento</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Fechar"
          >
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
            <span className="text-muted">Conta</span>
            <Select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              <option value="">Nenhuma</option>
              {accounts
                .filter((a) => !a.archived)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </Select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted">Título</span>
            <Select
              required
              value={ledgerId}
              onChange={(e) => {
                setLedgerId(e.target.value);
                setEnvelopeId(null);
              }}
            >
              <option value="">Escolha…</option>
              {ledger
                .filter((l) => !l.archived)
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
            </Select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted">Tipo</span>
            <Select
              value={envelopeValue}
              onChange={(e) => setEnvelopeId(e.target.value)}
            >
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
          <legend className="text-sm text-muted">Dono (rateio)</legend>
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
