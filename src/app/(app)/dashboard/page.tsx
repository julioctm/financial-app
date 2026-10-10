import { Card, PageHeader } from '@/components/ui/card';
import { requireProfile } from '@/lib/profile';
import { requireWorkspace } from '@/lib/workspace';

export default async function DashboardPage() {
  const { active } = await requireWorkspace();
  const profile = await requireProfile('/dashboard');

  return (
    <>
      <PageHeader
        title={active.name}
        description={`Olá, ${profile.first_name}.`}
      />
      <Card className="text-muted">
        Os módulos de lançamentos, orçamento e patrimônio vão aparecer aqui.
      </Card>
    </>
  );
}
