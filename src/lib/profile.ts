import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

export type Profile = { first_name: string | null; last_name: string | null };

export async function getProfile(): Promise<Profile> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { first_name: null, last_name: null };

  const { data } = await supabase
    .from('profiles')
    .select('first_name, last_name')
    .eq('id', user.id)
    .maybeSingle();
  return (data as Profile | null) ?? { first_name: null, last_name: null };
}

// Pages that create or show people must run after the user has a name, so the
// first name used across the app is never a leftover e-mail prefix.
export async function requireProfile(next: string): Promise<Profile> {
  const profile = await getProfile();
  if (!profile.first_name?.trim()) {
    redirect(`/completar-perfil?next=${encodeURIComponent(next)}`);
  }
  return profile;
}
