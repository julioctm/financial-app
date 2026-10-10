import { CatalogSection, type CatalogItem } from '@/components/CatalogSection';
import { PageHeader } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';
import { requireWorkspace } from '@/lib/workspace';

const ACCOUNT_KINDS = [
  { value: 'credit_card', label: 'Cartão de crédito' },
  { value: 'checking', label: 'Conta corrente' },
  { value: 'cash', label: 'Dinheiro' },
  { value: 'other', label: 'Outro' },
];
const LEDGER_KINDS = [
  { value: 'expense', label: 'Despesa' },
  { value: 'income', label: 'Receita' },
  { value: 'investment', label: 'Investimento' },
];

type Row = Record<string, string | number | null>;

const label = (opts: { value: string; label: string }[], v: unknown) =>
  opts.find((o) => o.value === v)?.label ?? '';

export default async function CadastrosPage() {
  const { active } = await requireWorkspace();
  const supabase = createClient();
  const byName = (a: Row, b: Row) =>
    String(a.name).localeCompare(String(b.name));

  const [accounts, envelopes, categories, ledger, people] = await Promise.all([
    supabase.from('accounts').select('*').eq('workspace_id', active.id),
    supabase.from('envelopes').select('*').eq('workspace_id', active.id),
    supabase.from('categories').select('*').eq('workspace_id', active.id),
    supabase.from('ledger_accounts').select('*').eq('workspace_id', active.id),
    supabase
      .from('people')
      .select('id, display_name')
      .eq('workspace_id', active.id)
      .eq('is_active', true),
  ]);

  const accountRows = ((accounts.data ?? []) as Row[]).sort(byName);
  const envelopeRows = ((envelopes.data ?? []) as Row[]).sort(byName);
  const categoryRows = ((categories.data ?? []) as Row[]).sort(byName);
  const ledgerRows = ((ledger.data ?? []) as Row[]).sort(byName);
  const peopleRows = (
    (people.data ?? []) as { id: string; display_name: string }[]
  ).sort((a, b) => a.display_name.localeCompare(b.display_name));

  const nameOf = (rows: Row[], id: unknown) =>
    rows.find((r) => r.id === id)?.name as string | undefined;
  const personName = (id: unknown) =>
    peopleRows.find((p) => p.id === id)?.display_name;
  const str = (v: unknown) => (v == null ? '' : String(v));

  const accountItems: CatalogItem[] = accountRows.map((a) => ({
    id: String(a.id),
    name: String(a.name),
    archived: a.archived_at != null,
    summary: [
      label(ACCOUNT_KINDS, a.kind),
      personName(a.holder_person_id) &&
        `titular ${personName(a.holder_person_id)}`,
      a.closing_day != null && `fecha dia ${a.closing_day}`,
    ]
      .filter(Boolean)
      .join(' · '),
    values: {
      name: String(a.name),
      kind: str(a.kind),
      holder_person_id: str(a.holder_person_id),
      closing_day: str(a.closing_day),
    },
  }));

  const simple = (rows: Row[]): CatalogItem[] =>
    rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      archived: r.archived_at != null,
      summary: '',
      values: { name: String(r.name) },
    }));

  const ledgerItems: CatalogItem[] = ledgerRows.map((l) => ({
    id: String(l.id),
    name: String(l.name),
    archived: l.archived_at != null,
    summary: [
      label(LEDGER_KINDS, l.kind),
      nameOf(categoryRows, l.category_id),
      nameOf(envelopeRows, l.default_envelope_id) &&
        `tipo padrão ${nameOf(envelopeRows, l.default_envelope_id)}`,
    ]
      .filter(Boolean)
      .join(' · '),
    values: {
      name: String(l.name),
      kind: str(l.kind),
      category_id: str(l.category_id),
      default_envelope_id: str(l.default_envelope_id),
    },
  }));

  const activeOptions = (rows: Row[]) =>
    rows
      .filter((r) => r.archived_at == null)
      .map((r) => ({ value: String(r.id), label: String(r.name) }));

  return (
    <>
      <PageHeader
        title="Cadastros"
        description="Contas, títulos, tipos e categorias usados nos lançamentos. Todos os membros podem editar."
      />
      <div className="max-w-2xl space-y-5">
        <CatalogSection
          title="Contas de pagamento"
          description="Cartões, contas e dinheiro. O dia de fechamento só sugere o mês de pagamento."
          table="accounts"
          workspaceId={active.id}
          addLabel="Nova conta"
          items={accountItems}
          fields={[
            { key: 'name', label: 'Nome', type: 'text', required: true },
            {
              key: 'kind',
              label: 'Tipo',
              type: 'select',
              required: true,
              options: ACCOUNT_KINDS,
            },
            {
              key: 'holder_person_id',
              label: 'Titular',
              type: 'select',
              options: peopleRows.map((p) => ({
                value: p.id,
                label: p.display_name,
              })),
            },
            {
              key: 'closing_day',
              label: 'Dia de fechamento',
              type: 'number',
              min: 1,
              max: 31,
            },
          ]}
        />
        <CatalogSection
          title="Títulos"
          description="As contas contábeis, como Mercado, Luz e Salário. A categoria vem do título; o tipo padrão é sugerido nos lançamentos."
          table="ledger_accounts"
          workspaceId={active.id}
          addLabel="Novo título"
          items={ledgerItems}
          fields={[
            { key: 'name', label: 'Nome', type: 'text', required: true },
            {
              key: 'kind',
              label: 'Natureza',
              type: 'select',
              required: true,
              options: LEDGER_KINDS,
            },
            {
              key: 'category_id',
              label: 'Categoria',
              type: 'select',
              options: activeOptions(categoryRows),
            },
            {
              key: 'default_envelope_id',
              label: 'Tipo padrão',
              type: 'select',
              options: activeOptions(envelopeRows),
            },
          ]}
        />
        <CatalogSection
          title="Tipos"
          description="Agrupadores como Custo fixo, Conforto e Metas. Cada lançamento pode ter um tipo."
          table="envelopes"
          workspaceId={active.id}
          addLabel="Novo tipo"
          items={simple(envelopeRows)}
          fields={[
            { key: 'name', label: 'Nome', type: 'text', required: true },
          ]}
        />
        <CatalogSection
          title="Categorias"
          description="Agrupadores como Essencial, Torra e Doações. Pertencem ao título."
          table="categories"
          workspaceId={active.id}
          addLabel="Nova categoria"
          items={simple(categoryRows)}
          fields={[
            { key: 'name', label: 'Nome', type: 'text', required: true },
          ]}
        />
      </div>
    </>
  );
}
