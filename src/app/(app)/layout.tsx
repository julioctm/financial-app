import { AppShell } from '@/components/AppShell';
import { createClient } from '@/lib/supabase/server';
import { requireWorkspace } from '@/lib/workspace';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { active, workspaces } = await requireWorkspace();
  const {
    data: { user },
  } = await createClient().auth.getUser();

  return (
    <AppShell
      workspaces={workspaces}
      activeId={active.id}
      email={user?.email ?? ''}
    >
      {children}
    </AppShell>
  );
}
