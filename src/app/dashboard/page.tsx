import { requireWorkspace } from '@/lib/workspace';
import { createClient } from '@/lib/supabase/server';

export default async function DashboardPage() {
  const { active } = await requireWorkspace();
  const {
    data: { user },
  } = await createClient().auth.getUser();

  return (
    <div className="card">
      <h1 className="mb-2 text-2xl font-bold">{active.name}</h1>
      <p className="text-gray-600">Olá, {user?.email}.</p>
    </div>
  );
}
