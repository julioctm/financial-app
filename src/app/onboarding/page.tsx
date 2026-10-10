import { redirect } from 'next/navigation';

import { createWorkspace } from '@/app/actions/workspace';
import { getWorkspaces } from '@/lib/workspace';

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  if ((await getWorkspaces()).length > 0) redirect('/dashboard');

  return (
    <div className="mx-auto max-w-md space-y-6">
      <form action={createWorkspace} className="card space-y-4">
        <h1 className="text-2xl font-bold">Criar workspace</h1>
        <p className="text-sm text-gray-600">
          Um workspace reúne os dados que você divide com outras pessoas, como
          sua casa. Você poderá convidar quem quiser depois.
        </p>
        <input
          name="name"
          required
          maxLength={80}
          placeholder="Nome (ex.: Casa)"
          className="w-full rounded border p-2"
        />
        {searchParams.error && (
          <p role="alert" className="text-sm text-red-600">
            Não foi possível criar o workspace. Verifique o nome e tente de
            novo.
          </p>
        )}
        <button className="btn btn-primary w-full">Criar workspace</button>
      </form>

      <div className="card text-sm text-gray-600">
        <h2 className="mb-1 font-semibold text-gray-800">Tenho um convite</h2>
        Abra o link de convite que você recebeu. Ele leva direto para a tela de
        entrada no workspace.
      </div>
    </div>
  );
}
