'use server';

import { revalidatePath } from 'next/cache';

import type { ActionResult } from '@/app/actions/workspace';
import { createClient } from '@/lib/supabase/server';

// Columns each catalog table accepts from the UI (RLS and column grants enforce it again).
const TABLES = {
  accounts: ['name', 'kind', 'holder_person_id', 'closing_day'],
  envelopes: ['name'],
  categories: ['name'],
  ledger_accounts: ['name', 'kind', 'category_id', 'default_envelope_id'],
} as const;

export type CatalogTable = keyof typeof TABLES;

type Values = Record<string, string>;

function clean(table: CatalogTable, values: Values) {
  const out: Record<string, string | number | null> = {};
  for (const key of TABLES[table]) {
    if (!(key in values)) continue;
    const raw = (values[key] ?? '').trim();
    if (key === 'closing_day') out[key] = raw ? Number(raw) : null;
    else out[key] = raw === '' && key !== 'name' ? null : raw;
  }
  return out;
}

function dbError(code: string | undefined): string {
  if (code === '23505') return 'Já existe um item com esse nome.';
  if (code === '23503')
    return 'Este item está em uso. Arquive-o em vez de excluir.';
  if (code === '23514') return 'Algum valor está fora do permitido.';
  return 'Algo deu errado. Tente novamente.';
}

export async function createCatalogItem(
  table: CatalogTable,
  workspaceId: string,
  values: Values,
): Promise<ActionResult> {
  const row = clean(table, values);
  if (!row.name) return { ok: false, error: 'Informe um nome.' };
  const { error } = await createClient()
    .from(table)
    .insert({ workspace_id: workspaceId, ...row });
  if (error) return { ok: false, error: dbError(error.code) };
  revalidatePath('/cadastros');
  return { ok: true };
}

export async function updateCatalogItem(
  table: CatalogTable,
  id: string,
  values: Values,
): Promise<ActionResult> {
  const row = clean(table, values);
  if ('name' in row && !row.name)
    return { ok: false, error: 'Informe um nome.' };
  const { data, error } = await createClient()
    .from(table)
    .update(row)
    .eq('id', id)
    .select('id');
  if (error) return { ok: false, error: dbError(error.code) };
  if (!data?.length) return { ok: false, error: 'Item não encontrado.' };
  revalidatePath('/cadastros');
  return { ok: true };
}

export async function setCatalogArchived(
  table: CatalogTable,
  id: string,
  archived: boolean,
): Promise<ActionResult> {
  const { data, error } = await createClient()
    .from(table)
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq('id', id)
    .select('id');
  if (error) return { ok: false, error: dbError(error.code) };
  if (!data?.length) return { ok: false, error: 'Item não encontrado.' };
  revalidatePath('/cadastros');
  return { ok: true };
}

export async function deleteCatalogItem(
  table: CatalogTable,
  id: string,
): Promise<ActionResult> {
  const { data, error } = await createClient()
    .from(table)
    .delete()
    .eq('id', id)
    .select('id');
  if (error) return { ok: false, error: dbError(error.code) };
  if (!data?.length) return { ok: false, error: 'Item não encontrado.' };
  revalidatePath('/cadastros');
  return { ok: true };
}
