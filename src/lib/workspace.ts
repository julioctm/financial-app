import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

export const ACTIVE_WORKSPACE_COOKIE = 'ws';

export type WorkspaceRole = 'owner' | 'member';

export type WorkspaceSummary = {
  id: string;
  name: string;
  role: WorkspaceRole;
};

export type Person = {
  id: string;
  display_name: string;
  user_id: string | null;
  is_active: boolean;
};

export async function getWorkspaces(): Promise<WorkspaceSummary[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  // Members can read every membership row of their workspaces (RLS), so the
  // query must be scoped to the current user or it returns one row per member.
  const { data } = await supabase
    .from('workspace_members')
    .select('role, workspaces(id, name)')
    .eq('user_id', user.id);

  const rows = (data ?? []) as unknown as {
    role: WorkspaceRole;
    workspaces: { id: string; name: string } | null;
  }[];

  return rows
    .filter((r) => r.workspaces)
    .map((r) => ({
      id: r.workspaces!.id,
      name: r.workspaces!.name,
      role: r.role,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// The active workspace lives in a cookie; fall back to the first one the user belongs to.
export function pickActive(
  workspaces: WorkspaceSummary[],
): WorkspaceSummary | null {
  const wanted = cookies().get(ACTIVE_WORKSPACE_COOKIE)?.value;
  return workspaces.find((w) => w.id === wanted) ?? workspaces[0] ?? null;
}

export async function requireWorkspace() {
  const workspaces = await getWorkspaces();
  const active = pickActive(workspaces);
  if (!active) redirect('/onboarding');
  return { active, workspaces };
}
