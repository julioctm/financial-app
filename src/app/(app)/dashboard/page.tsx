import { Card, PageHeader } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';
import { requireWorkspace } from '@/lib/workspace';

export default async function DashboardPage() {
  const { active } = await requireWorkspace();
  const {
    data: { user },
  } = await createClient().auth.getUser();

  return (
    <>
      <PageHeader title={active.name} description={`Olá, ${user?.email}.`} />
      <Card className="text-muted">
        Os módulos de lançamentos, orçamento e patrimônio vão aparecer aqui.
      </Card>
    </>
  );
}
