'use client';

import { useState, useTransition } from 'react';

import { saveSplit } from '@/app/actions/workspace';
import { Button } from '@/components/ui/button';
import { FormMessage, Input } from '@/components/ui/field';

type Row = { person_id: string; name: string; percent: number };

function parse(value: string): number {
  return Number(value.replace(',', '.'));
}

export function SplitForm({
  workspaceId,
  rows,
  canEdit,
}: {
  workspaceId: string;
  rows: Row[];
  canEdit: boolean;
}) {
  const [values, setValues] = useState(
    Object.fromEntries(rows.map((r) => [r.person_id, String(r.percent)])),
  );
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [pending, start] = useTransition();

  const total = rows.reduce(
    (sum, r) => sum + (parse(values[r.person_id]) || 0),
    0,
  );
  const totalOk = Math.abs(total - 100) < 0.001;

  function save() {
    setMessage(null);
    if (!totalOk) {
      setMessage({
        ok: false,
        text: `Os percentuais somam ${total.toFixed(2)}%, mas precisam somar exatamente 100%.`,
      });
      return;
    }
    start(async () => {
      const res = await saveSplit(
        workspaceId,
        rows.map((r) => ({
          person_id: r.person_id,
          percent: parse(values[r.person_id]),
        })),
      );
      setMessage(
        res.ok
          ? { ok: true, text: 'Rateio padrão salvo.' }
          : { ok: false, text: res.error },
      );
    });
  }

  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <label
          key={r.person_id}
          className="flex items-center justify-between gap-4"
        >
          <span>{r.name}</span>
          <span className="flex items-center gap-1">
            <Input
              inputMode="decimal"
              disabled={!canEdit}
              value={values[r.person_id]}
              aria-label={`Percentual de ${r.name}`}
              onChange={(e) =>
                setValues((v) => ({ ...v, [r.person_id]: e.target.value }))
              }
              className="w-24 text-right"
            />
            %
          </span>
        </label>
      ))}
      <p className={`text-sm ${totalOk ? 'text-positive' : 'text-negative'}`}>
        Total: {total.toFixed(2)}%
      </p>
      {rows.length === 1 && (
        <p className="text-sm text-muted">
          Com um único membro o rateio é 100%. Convide alguém para dividir.
        </p>
      )}
      <p className="text-sm text-muted">
        Alterar o rateio não muda lançamentos já feitos, só os próximos.
      </p>
      {canEdit && (
        <Button onClick={save} disabled={pending}>
          {pending ? 'Salvando…' : 'Salvar rateio'}
        </Button>
      )}
      {message && (
        <FormMessage kind={message.ok ? 'success' : 'error'}>
          {message.text}
        </FormMessage>
      )}
    </div>
  );
}
