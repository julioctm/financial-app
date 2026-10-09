'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { friendlyError } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { ACTIVE_WORKSPACE_COOKIE } from '@/lib/workspace';

export type ActionResult<T = object> =
  ({ ok: true } & T) | { ok: false; error: string };

function setActiveWorkspace(id: string) {
  cookies().set(ACTIVE_WORKSPACE_COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function createWorkspace(formData: FormData) {
  const name = String(formData.get('name') ?? '').trim();
  if (!name) redirect('/onboarding?error=nome');

  const { data, error } = await createClient().rpc('create_workspace', {
    p_name: name,
  });
  if (error || !data) redirect('/onboarding?error=falha');

  setActiveWorkspace(data as string);
  redirect('/dashboard');
}

export async function acceptInvite(formData: FormData) {
  const token = String(formData.get('token') ?? '');
  const { data, error } = await createClient().rpc('accept_invite', {
    p_token: token,
  });
  if (error || !data) {
    const code = error?.message.includes('invite_used')
      ? 'invite_used'
      : error?.message.includes('invite_expired')
        ? 'invite_expired'
        : 'invite_invalid';
    redirect(`/convite/${encodeURIComponent(token)}?error=${code}`);
  }

  setActiveWorkspace(data as string);
  redirect('/dashboard');
}

export async function switchWorkspace(formData: FormData) {
  const id = String(formData.get('workspace_id') ?? '');
  // RLS only returns workspaces the user belongs to, so this doubles as an access check.
  const { data } = await createClient()
    .from('workspaces')
    .select('id')
    .eq('id', id)
    .maybeSingle();
  if (data) setActiveWorkspace(id);
  redirect('/dashboard');
}

export async function createInvite(
  workspaceId: string,
): Promise<ActionResult<{ link: string }>> {
  const { data, error } = await createClient().rpc('create_invite', {
    p_workspace: workspaceId,
  });
  if (error || !data)
    return { ok: false, error: friendlyError(error?.message) };

  const h = headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'https';
  return { ok: true, link: `${proto}://${host}/convite/${data}` };
}

export async function removeMember(
  workspaceId: string,
  userId: string,
): Promise<ActionResult> {
  const { error } = await createClient().rpc('remove_member', {
    p_workspace: workspaceId,
    p_user: userId,
  });
  if (error) return { ok: false, error: friendlyError(error.message) };
  revalidatePath('/settings');
  return { ok: true };
}

export async function saveSplit(
  workspaceId: string,
  items: { person_id: string; percent: number }[],
): Promise<ActionResult> {
  const { error } = await createClient().rpc('set_split_defaults', {
    p_workspace: workspaceId,
    p_items: items,
  });
  if (error) return { ok: false, error: friendlyError(error.message) };
  revalidatePath('/settings');
  return { ok: true };
}

export async function addExternalPerson(
  workspaceId: string,
  name: string,
): Promise<ActionResult> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: 'Informe um nome.' };
  const { error } = await createClient()
    .from('people')
    .insert({ workspace_id: workspaceId, display_name: trimmed });
  if (error) return { ok: false, error: friendlyError(error.message) };
  revalidatePath('/settings');
  return { ok: true };
}

export async function removeExternalPerson(
  workspaceId: string,
  personId: string,
): Promise<ActionResult> {
  // Soft removal: the person stays for historical entries but disappears from the options.
  const { data, error } = await createClient()
    .from('people')
    .update({ is_active: false })
    .eq('id', personId)
    .eq('workspace_id', workspaceId)
    .is('user_id', null)
    .select('id');
  if (error) return { ok: false, error: friendlyError(error.message) };
  // RLS filters unauthorized rows silently, so zero rows means "not allowed".
  if (!data?.length) return { ok: false, error: friendlyError('forbidden') };
  revalidatePath('/settings');
  return { ok: true };
}

export async function renameMe(
  workspaceId: string,
  name: string,
): Promise<ActionResult> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: 'Informe um nome.' };
  const { error } = await createClient().rpc('update_my_display_name', {
    p_workspace: workspaceId,
    p_name: trimmed,
  });
  if (error) return { ok: false, error: friendlyError(error.message) };
  revalidatePath('/settings');
  return { ok: true };
}
