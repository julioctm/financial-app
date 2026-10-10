'use client';

import { useState, useTransition } from 'react';

import {
  createCatalogItem,
  deleteCatalogItem,
  setCatalogArchived,
  updateCatalogItem,
  type CatalogTable,
} from '@/app/actions/catalog';
import { ConfirmRemove } from '@/components/InlineActions';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage, Input, Select } from '@/components/ui/field';

export type FieldDef = {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select';
  options?: { value: string; label: string }[]; // select: '' (none) is added automatically
  required?: boolean;
  placeholder?: string; // select: shown as an empty first option (forces a choice when required)
  min?: number;
  max?: number;
};

export type CatalogItem = {
  id: string;
  name: string;
  summary: string;
  values: Record<string, string>;
  archived: boolean;
};

function Fields({
  fields,
  values,
}: {
  fields: FieldDef[];
  values?: Record<string, string>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {fields.map((f) => (
        <label key={f.key} className="space-y-1 text-sm">
          <span className="text-muted">{f.label}</span>
          {f.type === 'select' ? (
            <Select
              name={f.key}
              required={f.required}
              defaultValue={values?.[f.key] ?? ''}
            >
              {(f.placeholder || !f.required) && (
                <option value="">{f.placeholder ?? 'Nenhum'}</option>
              )}
              {f.options?.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          ) : (
            <Input
              name={f.key}
              type={f.type}
              required={f.required}
              min={f.min}
              max={f.max}
              maxLength={f.type === 'text' ? 80 : undefined}
              defaultValue={values?.[f.key] ?? ''}
            />
          )}
        </label>
      ))}
    </div>
  );
}

function readForm(form: HTMLFormElement): Record<string, string> {
  return Object.fromEntries(
    Array.from(new FormData(form).entries()).map(([k, v]) => [k, String(v)]),
  );
}

function Row({
  item,
  table,
  fields,
}: {
  item: CatalogItem;
  table: CatalogTable;
  fields: FieldDef[];
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const res = await action();
      if (!res.ok) setError(res.error ?? 'Algo deu errado.');
      else setEditing(false);
    });
  }

  if (editing) {
    return (
      <li className="space-y-3 py-3">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const values = readForm(e.currentTarget);
            run(() => updateCatalogItem(table, item.id, values));
          }}
        >
          <Fields fields={fields} values={item.values} />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              Salvar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setError(null);
              }}
            >
              Cancelar
            </Button>
            <ConfirmRemove
              label="Excluir"
              pending={pending}
              message="Excluir de vez?"
              onConfirm={() => run(() => deleteCatalogItem(table, item.id))}
            />
          </div>
        </form>
        {error && <FormMessage>{error}</FormMessage>}
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2.5">
      <span className={item.archived ? 'text-muted' : ''}>
        {item.name}
        {item.summary && (
          <span className="ml-2 text-sm text-muted">{item.summary}</span>
        )}
      </span>
      <span className="flex items-center gap-1">
        {error && <FormMessage>{error}</FormMessage>}
        <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
          Editar
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() =>
            run(() => setCatalogArchived(table, item.id, !item.archived))
          }
        >
          {item.archived ? 'Restaurar' : 'Arquivar'}
        </Button>
      </span>
    </li>
  );
}

export function CatalogSection({
  title,
  description,
  table,
  workspaceId,
  fields,
  items,
  addLabel,
}: {
  title: string;
  description: string;
  table: CatalogTable;
  workspaceId: string;
  fields: FieldDef[];
  items: CatalogItem[];
  addLabel: string;
}) {
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [showArchived, setShowArchived] = useState(false);

  const active = items.filter((i) => !i.archived);
  const archived = items.filter((i) => i.archived);

  return (
    <Card className="space-y-3">
      <div>
        <h2>{title}</h2>
        <p className="mt-1 text-muted">{description}</p>
      </div>

      {active.length > 0 ? (
        <ul className="divide-y divide-line">
          {active.map((i) => (
            <Row key={i.id} item={i} table={table} fields={fields} />
          ))}
        </ul>
      ) : (
        <p className="text-muted">Nada cadastrado ainda.</p>
      )}

      {adding ? (
        <form
          className="space-y-3 rounded-lg bg-canvas p-3"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const values = readForm(form);
            setError(null);
            start(async () => {
              const res = await createCatalogItem(table, workspaceId, values);
              if (res.ok) {
                form.reset();
                setAdding(false);
              } else setError(res.error);
            });
          }}
        >
          <Fields fields={fields} />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              Adicionar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setAdding(false);
                setError(null);
              }}
            >
              Cancelar
            </Button>
          </div>
          {error && <FormMessage>{error}</FormMessage>}
        </form>
      ) : (
        <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
          {addLabel}
        </Button>
      )}

      {archived.length > 0 && (
        <div>
          <button
            onClick={() => setShowArchived((v) => !v)}
            aria-expanded={showArchived}
            className="text-sm text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            {showArchived ? 'Ocultar' : 'Mostrar'} arquivados ({archived.length}
            )
          </button>
          {showArchived && (
            <ul className="divide-y divide-line">
              {archived.map((i) => (
                <Row key={i.id} item={i} table={table} fields={fields} />
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
