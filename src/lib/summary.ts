// Totals per person for the rows on screen, like the "Resumo" tab of the spreadsheet.

export type OwnerSummary = {
  personId: string;
  name: string;
  income: number;
  expense: number;
  balance: number;
};

type Row = { owner_person_id: string | null; amount_cents: number | null };

export function summarizeByOwner(
  rows: Row[],
  people: { id: string; name: string }[],
): {
  perOwner: OwnerSummary[];
  total: Omit<OwnerSummary, 'personId' | 'name'>;
} {
  const byOwner = new Map<string, OwnerSummary>();
  const total = { income: 0, expense: 0, balance: 0 };

  for (const r of rows) {
    if (!r.owner_person_id || !r.amount_cents) continue;
    const entry =
      byOwner.get(r.owner_person_id) ??
      ({
        personId: r.owner_person_id,
        name: people.find((p) => p.id === r.owner_person_id)?.name ?? '—',
        income: 0,
        expense: 0,
        balance: 0,
      } satisfies OwnerSummary);
    if (r.amount_cents > 0) {
      entry.income += r.amount_cents;
      total.income += r.amount_cents;
    } else {
      entry.expense += -r.amount_cents;
      total.expense += -r.amount_cents;
    }
    entry.balance = entry.income - entry.expense;
    byOwner.set(r.owner_person_id, entry);
  }
  total.balance = total.income - total.expense;

  return {
    perOwner: [...byOwner.values()].sort((a, b) =>
      a.name.localeCompare(b.name, 'pt-BR'),
    ),
    total,
  };
}
