import { describe, expect, it } from 'vitest';

import {
  blankDraft,
  isBlankDraft,
  isComplete,
  isUnmatched,
  missingFields,
  signedAmount,
  syncPaymentMonth,
  toGridRow,
  unmatchedText,
  withDefaults,
  withTrailingBlank,
} from '@/lib/drafts';

const defaults = { purchaseDate: '2026-10-19', paymentMonth: '2026-10-01' };
let n = 0;
const newId = () => `draft-${++n}`;

const filled = () => ({
  ...blankDraft('d'),
  ledger_account_id: 'led',
  owner_person_id: 'ana',
  amount_cents: -1000,
});

describe('blankDraft / isBlankDraft', () => {
  it('a linha nova é realmente em branco: nem data nem mês vêm preenchidos', () => {
    const d = blankDraft('d');
    expect(d.purchase_date).toBeNull();
    expect(d.payment_month).toBeNull();
    expect(d.pm_month).toBeNull();
    expect(d.pm_year).toBeNull();
    expect(isBlankDraft(d)).toBe(true);
  });

  it.each([
    ['descrição', { description: 'x' }],
    ['data', { purchase_date: '2026-10-01' }],
    ['mês', { pm_month: 10 }],
    ['ano', { pm_year: 2026 }],
    ['título', { ledger_account_id: 'led' }],
    ['dono', { owner_person_id: 'ana' }],
    ['valor', { amount_cents: -5 }],
    ['cartão', { account_id: 'acc' }],
    ['tipo', { envelope_id: 'env' }],
    ['pagar para', { pay_to_person_id: 'ana' }],
  ])('deixa de ser branca quando %s é preenchido', (_label, patch) => {
    expect(isBlankDraft({ ...blankDraft('d'), ...patch })).toBe(false);
  });
});

describe('toGridRow / syncPaymentMonth', () => {
  const saved = {
    id: 'x',
    purchase_date: '2026-10-19',
    payment_month: '2026-10-01',
    description: 'd',
    ledger_account_id: 'led',
    envelope_id: null,
    account_id: null,
    pay_to_person_id: null,
    owner_person_id: 'ana',
    amount_cents: -100,
    updated_at: 't',
    installment_group_id: null,
    installment_number: null,
    split_percent: null,
  };

  it('separa o mês de pagamento em mês e ano, como na planilha', () => {
    const g = toGridRow(saved);
    expect(g.pm_month).toBe(10);
    expect(g.pm_year).toBe(2026);
  });

  it('payment_month acompanha as colunas de mês e ano', () => {
    expect(
      syncPaymentMonth({ ...blankDraft('d'), pm_month: 3, pm_year: 2027 })
        .payment_month,
    ).toBe('2027-03-01');
    expect(
      syncPaymentMonth({ ...blankDraft('d'), pm_month: 3, pm_year: null })
        .payment_month,
    ).toBeNull();
  });
});

describe('missingFields / isComplete', () => {
  it('uma linha em branco está sem título, dono e valor', () => {
    expect(missingFields(blankDraft('d'))).toEqual([
      'falta o título',
      'falta o dono',
      'falta o valor',
    ]);
  });

  it('com título, dono e valor está completa (data e mês são opcionais: têm padrão)', () => {
    expect(missingFields(filled())).toEqual([]);
    expect(isComplete(filled())).toBe(true);
  });

  it('valor zero não conta como preenchido', () => {
    expect(missingFields({ ...filled(), amount_cents: 0 })).toEqual([
      'falta o valor',
    ]);
  });

  it('mês sem ano (ou ano sem mês) avisa o que falta', () => {
    expect(missingFields({ ...filled(), pm_month: 10 })).toEqual([
      'falta o ano de pagamento',
    ]);
    expect(missingFields({ ...filled(), pm_year: 2026 })).toEqual([
      'falta o mês de pagamento',
    ]);
    expect(missingFields({ ...filled(), pm_month: 10, pm_year: 2026 })).toEqual(
      [],
    );
  });

  it('valor colado que não existe nos cadastros aparece como "não encontrado"', () => {
    const row = { ...filled(), ledger_account_id: '?:Mercadinho' };
    expect(missingFields(row)).toEqual(['Título “Mercadinho” não encontrado']);
    expect(isComplete(row)).toBe(false);
  });

  it('cartão ou tipo não encontrados também impedem salvar', () => {
    expect(missingFields({ ...filled(), account_id: '?:Nubank' })).toEqual([
      'Cartão “Nubank” não encontrado',
    ]);
  });

  it('data, mês e ano inválidos não são trocados em silêncio pelo padrão', () => {
    expect(
      missingFields({ ...filled(), purchase_date: '?:31/02/2026' }),
    ).toEqual(['Data “31/02/2026” inválida']);
    expect(
      missingFields({ ...filled(), pm_month: '?:XYZ', pm_year: 2026 }),
    ).toEqual(['Mês “XYZ” inválido']);
    expect(
      missingFields({ ...filled(), pm_month: 10, pm_year: '?:20x' }),
    ).toEqual(['Ano “20x” inválido']);
  });
});

describe('withDefaults', () => {
  it('data e mês vazios assumem hoje e o mês da tela', () => {
    const d = withDefaults(filled(), defaults);
    expect(d.purchase_date).toBe('2026-10-19');
    expect(d.payment_month).toBe('2026-10-01');
  });

  it('não sobrescreve o que o usuário preencheu', () => {
    const d = withDefaults(
      { ...filled(), purchase_date: '2026-01-05', payment_month: '2026-03-01' },
      defaults,
    );
    expect(d.purchase_date).toBe('2026-01-05');
    expect(d.payment_month).toBe('2026-03-01');
  });
});

describe('unmatched helpers', () => {
  it('reconhece e devolve o texto original', () => {
    expect(isUnmatched('?:abc')).toBe(true);
    expect(isUnmatched('abc')).toBe(false);
    expect(isUnmatched(null)).toBe(false);
    expect(unmatchedText('?:Mercadinho')).toBe('Mercadinho');
  });
});

describe('signedAmount', () => {
  it('receita entra positiva; o resto sai negativo, independentemente do sinal digitado', () => {
    expect(signedAmount(1000, 'income')).toBe(1000);
    expect(signedAmount(-1000, 'income')).toBe(1000);
    expect(signedAmount(1000, 'expense')).toBe(-1000);
    expect(signedAmount(-1000, 'expense')).toBe(-1000);
    expect(signedAmount(1000, 'investment')).toBe(-1000);
    expect(signedAmount(1000, undefined)).toBe(-1000);
  });
});

describe('withTrailingBlank', () => {
  it('sempre termina com exatamente uma linha em branco', () => {
    const out = withTrailingBlank([filled()], newId);
    expect(out).toHaveLength(2);
    expect(isBlankDraft(out[1])).toBe(true);
  });

  it('não acumula linhas em branco', () => {
    const out = withTrailingBlank(
      [blankDraft('a'), blankDraft('b'), filled()],
      newId,
    );
    expect(out.filter((d) => isBlankDraft(d))).toHaveLength(1);
    expect(isBlankDraft(out[out.length - 1])).toBe(true);
  });

  it('reaproveita a linha em branco existente (mantém o id)', () => {
    const out = withTrailingBlank([filled(), blankDraft('keep-me')], newId);
    expect(out[out.length - 1].id).toBe('keep-me');
  });

  it('cria a linha em branco quando a lista está vazia', () => {
    expect(withTrailingBlank([], newId)).toHaveLength(1);
  });
});
