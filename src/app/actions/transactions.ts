'use server';

import { revalidatePath } from 'next/cache';

import type { ActionResult } from '@/app/actions/workspace';
import { friendlyError } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';

export type CellPatch = Partial<{
  purchase_date: string;
  payment_month: string;
  description: string;
  ledger_account_id: string;
  envelope_id: string | null;
  account_id: string | null;
  pay_to_person_id: string | null;
}>;

const PATCH_KEYS: (keyof CellPatch)[] = [
  'purchase_date',
  'payment_month',
  'description',
  'ledger_account_id',
  'envelope_id',
  'account_id',
  'pay_to_person_id',
];

export type Stamp = { updated_at: string };

// Plain cell edits go straight to the table; `expected` makes the write conditional
// on nobody else having changed the row (optimistic concurrency).
export async function updateTransactionFields(
  id: string,
  patch: CellPatch,
  expected: string,
): Promise<ActionResult<Stamp>> {
  const clean: Record<string, unknown> = {};
  for (const key of PATCH_KEYS) if (key in patch) clean[key] = patch[key];
  if (Object.keys(clean).length === 0)
    return { ok: true, updated_at: expected };

  const { data, error } = await createClient()
    .from('transactions')
    .update(clean)
    .eq('id', id)
    .eq('updated_at', expected)
    .select('updated_at');

  if (error) {
    return {
      ok: false,
      error:
        error.code === '23514'
          ? 'Algum valor está fora do permitido.'
          : 'Não foi possível salvar. Tente novamente.',
    };
  }
  if (!data?.length) return { ok: false, error: friendlyError('conflict') };
  return { ok: true, updated_at: (data[0] as Stamp).updated_at };
}

export async function setTransactionAmount(
  id: string,
  amountCents: number,
  expected: string,
): Promise<ActionResult<Stamp>> {
  const { data, error } = await createClient().rpc('set_transaction_amount', {
    p_tx: id,
    p_amount_cents: amountCents,
    p_expected: expected,
  });
  if (error) return { ok: false, error: friendlyError(error.message) };
  return { ok: true, updated_at: data as string };
}

export type InstallmentScope = 'single' | 'following' | 'all';

export async function applyToInstallments(
  id: string,
  scope: InstallmentScope,
  changes: Record<string, string | number | null>,
): Promise<ActionResult<{ count: number }>> {
  const { data, error } = await createClient().rpc('update_installments', {
    p_tx: id,
    p_scope: scope,
    p_changes: changes,
  });
  if (error) return { ok: false, error: friendlyError(error.message) };
  revalidatePath('/lancamentos');
  return { ok: true, count: data as number };
}

export async function deleteTransactions(
  ids: string[],
  scope: InstallmentScope,
): Promise<ActionResult<{ count: number }>> {
  const { data, error } = await createClient().rpc('delete_transactions', {
    p_ids: ids,
    p_scope: scope,
  });
  if (error) return { ok: false, error: friendlyError(error.message) };
  revalidatePath('/lancamentos');
  return { ok: true, count: data as number };
}

export type NewTransaction = {
  workspaceId: string;
  purchaseDate: string;
  paymentMonth: string;
  accountId: string | null;
  ledgerAccountId: string;
  envelopeId: string | null;
  description: string;
  amountCents: number; // signed
  payToPersonId: string | null;
  shares: { person_id: string; percent: number }[];
  installments: number;
  amountIsTotal: boolean;
};

export async function createTransaction(
  t: NewTransaction,
): Promise<ActionResult<{ count: number }>> {
  const { data, error } = await createClient().rpc('create_transaction', {
    p_workspace: t.workspaceId,
    p_purchase_date: t.purchaseDate,
    p_payment_month: t.paymentMonth,
    p_account: t.accountId,
    p_ledger: t.ledgerAccountId,
    p_envelope: t.envelopeId,
    p_description: t.description,
    p_amount_cents: t.amountCents,
    p_pay_to: t.payToPersonId,
    p_shares: t.shares,
    p_installments: t.installments,
    p_amount_is_total: t.amountIsTotal,
  });
  if (error) return { ok: false, error: friendlyError(error.message) };
  revalidatePath('/lancamentos');
  return { ok: true, count: (data as string[]).length };
}
