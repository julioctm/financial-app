import {
  AddExternalForm,
  RemoveExternalButton,
  RemoveMemberButton,
  RenameMeForm,
} from '@/components/InlineActions';
import { InviteButton } from '@/components/InviteButton';
import { SplitForm } from '@/components/SplitForm';
import { Card, PageHeader } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';
import { requireWorkspace, type Person } from '@/lib/workspace';

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="space-y-4">
      <div>
        <h2>{title}</h2>
        {description && <p className="mt-1 text-muted">{description}</p>}
      </div>
      {children}
    </Card>
  );
}

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
    <>
      <PageHeader
        title="Configurações"
        description={`Workspace ${active.name}`}
      />
      <div className="max-w-2xl space-y-5">
        <Section title="Seu nome neste workspace">
          <RenameMeForm
            key={myPerson?.person_id}
            workspaceId={active.id}
            current={myPerson ? (nameOf.get(myPerson.person_id) ?? '') : ''}
          />
        </Section>

        <Section title="Membros">
          <ul className="divide-y divide-line">
            {members.map((m) => (
              <li
                key={m.user_id}
                className="flex flex-wrap items-center justify-between gap-2 py-2.5"
              >
                <span className="flex items-center gap-2">
                  {nameOf.get(m.person_id)}
                  {m.user_id === me && (
                    <span className="text-muted">(você)</span>
                  )}
                  <span className="rounded-full bg-accent-tint px-2 py-0.5 text-xs text-accent-ink">
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
        </Section>

        <Section
          title="Rateio padrão"
          description="Divisão inicial de cada lançamento compartilhado. Pode ser ajustada em cada lançamento."
        >
          <SplitForm
            key={splitRows.map((r) => `${r.person_id}:${r.percent}`).join('|')}
            workspaceId={active.id}
            rows={splitRows}
            canEdit={isOwner}
          />
        </Section>

        <Section
          title="Pessoas sem login"
          description="Aparecem como opção de Dono ou Pagar Para nos lançamentos, mas não acessam o app."
        >
          {externals.length > 0 && (
            <ul className="divide-y divide-line">
              {externals.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between py-2.5"
                >
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
        </Section>
      </div>
    </>
  );
}
