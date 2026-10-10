import {
  AddExternalForm,
  RemoveExternalButton,
  RemoveMemberButton,
  RenameMeForm,
} from '@/components/InlineActions';
import { InviteButton } from '@/components/InviteButton';
import { SplitForm } from '@/components/SplitForm';
import { createClient } from '@/lib/supabase/server';
import { requireWorkspace, type Person } from '@/lib/workspace';

export default async function SettingsPage() {
  const { active } = await requireWorkspace();
  const supabase = createClient();
  const isOwner = active.role === 'owner';

  const [
    { data: auth },
    { data: peopleData },
    { data: membersData },
    { data: splitData },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from('people')
      .select('id, display_name, user_id, is_active')
      .eq('workspace_id', active.id),
    supabase
      .from('workspace_members')
      .select('user_id, role, person_id')
      .eq('workspace_id', active.id),
    supabase
      .from('workspace_split_defaults')
      .select('person_id, percent')
      .eq('workspace_id', active.id),
  ]);

  const people = (peopleData ?? []) as Person[];
  const members = (membersData ?? []) as {
    user_id: string;
    role: string;
    person_id: string;
  }[];
  const split = new Map(
    ((splitData ?? []) as { person_id: string; percent: number }[]).map((s) => [
      s.person_id,
      Number(s.percent),
    ]),
  );
  const nameOf = new Map(people.map((p) => [p.id, p.display_name]));
  const me = auth.user?.id;
  const myPerson = members.find((m) => m.user_id === me);
  const externals = people.filter((p) => p.user_id === null && p.is_active);

  const splitRows = members
    .map((m) => ({
      person_id: m.person_id,
      name: nameOf.get(m.person_id) ?? '—',
      percent: split.get(m.person_id) ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Configurações · {active.name}</h1>

      <section className="card space-y-3">
        <h2 className="text-lg font-semibold">Seu nome neste workspace</h2>
        <RenameMeForm
          key={myPerson?.person_id}
          workspaceId={active.id}
          current={myPerson ? (nameOf.get(myPerson.person_id) ?? '') : ''}
        />
      </section>

      <section className="card space-y-3">
        <h2 className="text-lg font-semibold">Membros</h2>
        <ul className="divide-y">
          {members.map((m) => (
            <li
              key={m.user_id}
              className="flex items-center justify-between py-2"
            >
              <span>
                {nameOf.get(m.person_id)}
                {m.user_id === me && (
                  <span className="text-gray-500"> (você)</span>
                )}
                <span className="ml-2 rounded bg-gray-100 px-2 py-0.5 text-xs">
                  {m.role === 'owner' ? 'owner' : 'membro'}
                </span>
              </span>
              {isOwner && m.user_id !== me && (
                <RemoveMemberButton
                  workspaceId={active.id}
                  userId={m.user_id}
                  name={nameOf.get(m.person_id) ?? 'este membro'}
                />
              )}
            </li>
          ))}
        </ul>
        {isOwner && <InviteButton workspaceId={active.id} />}
      </section>

      <section className="card space-y-3">
        <h2 className="text-lg font-semibold">Rateio padrão</h2>
        <SplitForm
          key={splitRows.map((r) => `${r.person_id}:${r.percent}`).join('|')}
          workspaceId={active.id}
          rows={splitRows}
          canEdit={isOwner}
        />
      </section>

      <section className="card space-y-3">
        <h2 className="text-lg font-semibold">Pessoas sem login</h2>
        <p className="text-sm text-gray-600">
          Aparecem como opção de Dono ou Pagar Para nos lançamentos, mas não
          acessam o app.
        </p>
        {externals.length > 0 && (
          <ul className="divide-y">
            {externals.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2">
                <span>{p.display_name}</span>
                {isOwner && (
                  <RemoveExternalButton
                    workspaceId={active.id}
                    personId={p.id}
                    name={p.display_name}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
        {isOwner && <AddExternalForm workspaceId={active.id} />}
      </section>
    </div>
  );
}
