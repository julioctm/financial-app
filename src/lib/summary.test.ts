import { describe, expect, it } from 'vitest';

import { summarizeByOwner } from '@/lib/summary';

const people = [
  { id: 'ana', name: 'Ana' },
  { id: 'bruno', name: 'Bruno' },
];

describe('summarizeByOwner', () => {
  it('soma entradas, saídas e saldo por pessoa e no total', () => {
    const { perOwner, total } = summarizeByOwner(
      [
        { owner_person_id: 'ana', amount_cents: 980000 },
        { owner_person_id: 'ana', amount_cents: -41280 },
        { owner_person_id: 'bruno', amount_cents: -2000 },
        { owner_person_id: 'ana', amount_cents: -100 },
      ],
      people,
    );
    expect(perOwner).toEqual([
      {
        personId: 'ana',
        name: 'Ana',
        income: 980000,
        expense: 41380,
        balance: 938620,
      },
      {
        personId: 'bruno',
        name: 'Bruno',
        income: 0,
        expense: 2000,
        balance: -2000,
      },
    ]);
    expect(total).toEqual({ income: 980000, expense: 43380, balance: 936620 });
  });

  it('só lista quem tem lançamentos e ordena por nome', () => {
    const { perOwner } = summarizeByOwner(
      [
        { owner_person_id: 'bruno', amount_cents: -1 },
        { owner_person_id: 'ana', amount_cents: -1 },
      ],
      people,
    );
    expect(perOwner.map((o) => o.name)).toEqual(['Ana', 'Bruno']);
    expect(summarizeByOwner([], people).perOwner).toEqual([]);
  });

  it('ignora linhas sem dono ou sem valor e nunca perde centavos', () => {
    const { total } = summarizeByOwner(
      [
        { owner_person_id: null, amount_cents: -500 },
        { owner_person_id: 'ana', amount_cents: null },
        { owner_person_id: 'ana', amount_cents: 0 },
        { owner_person_id: 'ana', amount_cents: -1 },
        { owner_person_id: 'ana', amount_cents: 3 },
      ],
      people,
    );
    expect(total).toEqual({ income: 3, expense: 1, balance: 2 });
  });

  it('dono desconhecido aparece como "—"', () => {
    expect(
      summarizeByOwner([{ owner_person_id: 'x', amount_cents: -5 }], people)
        .perOwner[0].name,
    ).toBe('—');
  });
});
