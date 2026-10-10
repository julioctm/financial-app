import { acceptInvite } from '@/app/actions/workspace';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/field';
import { friendlyError } from '@/lib/errors';
import { requireProfile } from '@/lib/profile';
import { createClient } from '@/lib/supabase/server';

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { error?: string };
}) {
  const token = decodeURIComponent(params.token);
  await requireProfile(`/convite/${params.token}`);
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
  const errorText = error
    ? friendlyError(`invite_${error.replace('invite_', '')}`)
    : null;

  return (
    <Card className="space-y-4">
      <h1>Convite para workspace</h1>
      {status === 'valid' && preview ? (
        <>
          <p>
            Você foi convidado para o workspace{' '}
            <strong>{preview.workspace_name}</strong>.
          </p>
          {errorText && <FormMessage>{errorText}</FormMessage>}
          <form action={acceptInvite}>
            <input type="hidden" name="token" value={token} />
            <Button type="submit" className="w-full">
              {preview.already_member
                ? 'Abrir workspace'
                : 'Entrar no workspace'}
            </Button>
          </form>
        </>
      ) : (
        <FormMessage>{errorText}</FormMessage>
      )}
    </Card>
  );
}
