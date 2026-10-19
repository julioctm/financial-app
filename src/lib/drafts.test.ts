import { describe, expect, it } from 'vitest';

import {
  blankDraft,
  isBlankDraft,
  isComplete,
  isUnmatched,
  missingFields,
  signedAmount,
  unmatchedText,
  withTrailingBlank,
} from '@/lib/drafts';

const defaults = { purchaseDate: '2026-10-19', paymentMonth: '2026-10-01' };
let n = 0;
const newId = () => `draft-${++n}`;

const filled = () => ({
  ...blankDraft('d', defaults),
  ledger_account_id: 'led',
  owner_person_id: 'ana',
  amount_cents: -1000,
});

describe('isBlankDraft', () => {
  it('a linha recém-criada é branca', () => {
    expect(isBlankDraft(blankDraft('d', defaults), defaults)).toBe(true);
  });

  it.each([
    ['descrição', { description: 'x' }],
    ['título', { ledger_account_id: 'led' }],
    ['dono', { owner_person_id: 'ana' }],
    ['valor', { amount_cents: -5 }],
    ['conta', { account_id: 'acc' }],
    ['data diferente da padrão', { purchase_date: '2026-10-01' }],
    ['mês diferente do padrão', { payment_month: '2026-11-01' }],
  ])('deixa de ser branca quando %s é preenchido', (_label, patch) => {
    expect(
      isBlankDraft({ ...blankDraft('d', defaults), ...patch }, defaults),
    ).toBe(false);
  });
});

describe('missingFields / isComplete', () => {
  it('uma linha em branco está sem título, dono e valor', () => {
    expect(missingFields(blankDraft('d', defaults))).toEqual([
      'falta o título',
      'falta o dono',
      'falta o valor',
    ]);
  });

  it('com título, dono e valor está completa (data e mês vêm preenchidos)', () => {
    expect(missingFields(filled())).toEqual([]);
    expect(isComplete(filled())).toBe(true);
  });

  it('valor zero não conta como preenchido', () => {
    expect(missingFields({ ...filled(), amount_cents: 0 })).toEqual([
      'falta o valor',
    ]);
  });

  it('sem data ou sem mês de pagamento, avisa', () => {
    expect(missingFields({ ...filled(), purchase_date: null })).toEqual([
      'falta a data',
    ]);
    expect(missingFields({ ...filled(), payment_month: null })).toEqual([
      'falta o mês de pagamento',
    ]);
  });

  it('valor colado que não existe nos cadastros aparece como "não encontrado"', () => {
    const row = { ...filled(), ledger_account_id: '?:Mercadinho' };
    expect(missingFields(row)).toEqual(['Título “Mercadinho” não encontrado']);
    expect(isComplete(row)).toBe(false);
  });

  it('conta ou tipo não encontrados também impedem salvar', () => {
    expect(missingFields({ ...filled(), account_id: '?:Nubank' })).toEqual([
      'Conta “Nubank” não encontrado',
    ]);
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
    const out = withTrailingBlank([filled()], defaults, newId);
    expect(out).toHaveLength(2);
    expect(isBlankDraft(out[1], defaults)).toBe(true);
  });

  it('não acumula linhas em branco', () => {
    const blank = blankDraft('a', defaults);
    const out = withTrailingBlank(
      [blank, blankDraft('b', defaults), filled()],
      defaults,
      newId,
    );
    expect(out.filter((d) => isBlankDraft(d, defaults))).toHaveLength(1);
    expect(isBlankDraft(out[out.length - 1], defaults)).toBe(true);
  });

  it('reaproveita a linha em branco existente (mantém o id)', () => {
    const blank = blankDraft('keep-me', defaults);
    const out = withTrailingBlank([filled(), blank], defaults, newId);
    expect(out[out.length - 1].id).toBe('keep-me');
  });

  it('cria a linha em branco quando a lista está vazia', () => {
    expect(withTrailingBlank([], defaults, newId)).toHaveLength(1);
  });
});
