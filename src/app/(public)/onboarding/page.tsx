import { redirect } from 'next/navigation';

import { createWorkspace } from '@/app/actions/workspace';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage, Input } from '@/components/ui/field';
import { getWorkspaces } from '@/lib/workspace';

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  if ((await getWorkspaces()).length > 0) redirect('/dashboard');

  return (
    <div className="space-y-4">
      <Card>
        <form action={createWorkspace} className="space-y-4">
          <h1>Criar workspace</h1>
          <p className="text-muted">
            Um workspace reúne os dados que você divide com outras pessoas, como
            sua casa. Você poderá convidar quem quiser depois.
          </p>
          <Input
            name="name"
            required
            maxLength={80}
            placeholder="Nome (ex.: Casa)"
            aria-label="Nome do workspace"
          />
          {searchParams.error && (
            <FormMessage>
              Não foi possível criar o workspace. Verifique o nome e tente de
              novo.
            </FormMessage>
          )}
          <Button type="submit" className="w-full">
            Criar workspace
          </Button>
        </form>
      </Card>
      <p className="px-1 text-sm text-muted">
        Recebeu um convite? Abra o link que enviaram para você.
      </p>
    </div>
  );
}
