import { describe, expect, it } from 'vitest';

import {
  formatPaymentMonth,
  isMonthKey,
  monthLabel,
  parsePaymentMonth,
  shiftMonth,
  suggestPaymentMonth,
} from '@/lib/dates';

describe('isMonthKey', () => {
  it('aceita YYYY-MM válido e rejeita o resto', () => {
    expect(isMonthKey('2026-10')).toBe(true);
    expect(isMonthKey('2026-1')).toBe(false);
    expect(isMonthKey('2026-13')).toBe(false);
    expect(isMonthKey('2026-00')).toBe(false);
    expect(isMonthKey('outubro')).toBe(false);
    expect(isMonthKey(undefined)).toBe(false);
  });
});

describe('shiftMonth', () => {
  it('avança e volta meses, virando o ano', () => {
    expect(shiftMonth('2026-10', 1)).toBe('2026-11');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-10', 14)).toBe('2027-12');
    expect(shiftMonth('2026-10', 0)).toBe('2026-10');
  });
});

describe('monthLabel', () => {
  it('escreve o mês por extenso com a primeira letra maiúscula', () => {
    expect(monthLabel('2026-10')).toBe('Outubro de 2026');
    expect(monthLabel('2027-03')).toBe('Março de 2027');
  });
});

describe('parsePaymentMonth', () => {
  it.each([
    ['10/2026', '2026-10-01'],
    ['1/2026', '2026-01-01'],
    ['10/26', '2026-10-01'],
    ['2026-10', '2026-10-01'],
    ['2026-10-15', '2026-10-01'],
    ['out/2026', '2026-10-01'],
    ['OUT 2026', '2026-10-01'],
    ['dez-26', '2026-12-01'],
    ['  mar/2027 ', '2027-03-01'],
  ])('interpreta %j como %s', (input, expected) => {
    expect(parsePaymentMonth(input)).toBe(expected);
  });

  it.each([
    '',
    '13/2026',
    '00/2026',
    'xyz/2026',
    '2026',
    '10/1800',
    null,
    undefined,
  ])('devolve null para %j', (input) => {
    expect(parsePaymentMonth(input as string | null | undefined)).toBeNull();
  });
});

describe('formatPaymentMonth', () => {
  it('mostra MM/AAAA', () => {
    expect(formatPaymentMonth('2026-10-01')).toBe('10/2026');
    expect(formatPaymentMonth(null)).toBe('');
  });
});

describe('suggestPaymentMonth', () => {
  it('sem dia de fechamento, usa o mês da compra', () => {
    expect(suggestPaymentMonth('2026-10-19', null)).toBe('2026-10-01');
  });

  it('compra até o dia de fechamento fica no mesmo mês', () => {
    expect(suggestPaymentMonth('2026-10-10', 10)).toBe('2026-10-01');
    expect(suggestPaymentMonth('2026-10-03', 10)).toBe('2026-10-01');
  });

  it('compra depois do fechamento vai para o mês seguinte', () => {
    expect(suggestPaymentMonth('2026-10-11', 10)).toBe('2026-11-01');
    expect(suggestPaymentMonth('2026-10-19', 10)).toBe('2026-11-01');
  });

  it('vira o ano em dezembro', () => {
    expect(suggestPaymentMonth('2026-12-20', 10)).toBe('2027-01-01');
  });
});
