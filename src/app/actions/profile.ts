'use server';

import { revalidatePath } from 'next/cache';

import type { ActionResult } from '@/app/actions/workspace';
import { createClient } from '@/lib/supabase/server';

export async function updateProfile(
  firstName: string,
  lastName: string,
): Promise<ActionResult> {
  if (!firstName.trim()) return { ok: false, error: 'Informe seu nome.' };
  const { error } = await createClient().rpc('update_profile', {
    p_first_name: firstName,
    p_last_name: lastName,
  });
  if (error) {
    return {
      ok: false,
      error: error.message.includes('first_name_required')
        ? 'Informe seu nome.'
        : 'Não foi possível salvar. Tente novamente.',
    };
  }
  revalidatePath('/', 'layout');
  return { ok: true };
}
