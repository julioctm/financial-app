import { AppShell } from '@/components/AppShell';
import { requireProfile } from '@/lib/profile';
import { createClient } from '@/lib/supabase/server';
import { requireWorkspace } from '@/lib/workspace';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile('/dashboard');
  const { active, workspaces } = await requireWorkspace();
  const {
    data: { user },
  } = await createClient().auth.getUser();

  return (
    <AppShell
      workspaces={workspaces}
      activeId={active.id}
      email={user?.email ?? ''}
      name={[profile.first_name, profile.last_name].filter(Boolean).join(' ')}
    >
      {children}
    </AppShell>
  );
}
