import { acceptInvite } from '@/app/actions/workspace';
import { friendlyError } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { error?: string };
}) {
  const token = decodeURIComponent(params.token);
  const { data } = await createClient().rpc('get_invite_preview', {
    p_token: token,
  });
  const preview = (
    data as
      | {
          status: string;
          workspace_name: string | null;
          already_member: boolean;
        }[]
      | null
  )?.[0];

  const status = preview?.status ?? 'invalid';
  const error = searchParams.error ?? (status === 'valid' ? null : status);

  return (
    <div className="card mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold">Convite para workspace</h1>
      {status === 'valid' && preview ? (
        <>
          <p>
            Você foi convidado para o workspace{' '}
            <strong>{preview.workspace_name}</strong>.
          </p>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {friendlyError(`invite_${error.replace('invite_', '')}`)}
            </p>
          )}
          <form action={acceptInvite}>
            <input type="hidden" name="token" value={token} />
            <button className="btn btn-primary w-full">
              {preview.already_member
                ? 'Abrir workspace'
                : 'Entrar no workspace'}
            </button>
          </form>
        </>
      ) : (
        <p role="alert" className="text-red-600">
          {friendlyError(`invite_${status.replace('invite_', '')}`)}
        </p>
      )}
    </div>
  );
}
