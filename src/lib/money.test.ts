import { describe, expect, it } from 'vitest';

import { editableMoney, formatMoney, parseMoney } from '@/lib/money';

describe('parseMoney', () => {
  it.each([
    ['1.234,56', 123456],
    ['1234,56', 123456],
    ['1234.56', 123456],
    ['412,80', 41280],
    ['10', 1000],
    ['0,5', 50],
    ['-50', -5000],
    ['-1.234,56', -123456],
    ['R$ 10,50', 1050],
    ['(25,00)', -2500],
    ['1.234', 123400], // dot as thousands separator when there is no decimal part
    ['  7,05  ', 705],
  ])('converte %j em %i centavos', (input, cents) => {
    expect(parseMoney(input)).toBe(cents);
  });

  it('arredonda a terceira casa decimal para cima na metade', () => {
    expect(parseMoney('0,005')).toBe(1);
    expect(parseMoney('0,004')).toBe(0);
  });

  it.each(['', '   ', 'abc', '1,2,3', '12a', null, undefined])(
    'devolve null para entrada inválida %j',
    (input) => {
      expect(parseMoney(input as string | null | undefined)).toBeNull();
    },
  );
});

describe('formatMoney', () => {
  it('formata em pt-BR com duas casas', () => {
    expect(formatMoney(123456)).toBe('1.234,56');
    expect(formatMoney(-33334)).toBe('-333,34');
    expect(formatMoney(5)).toBe('0,05');
    expect(formatMoney(0)).toBe('0,00');
  });

  it('devolve vazio para valor ausente', () => {
    expect(formatMoney(null)).toBe('');
    expect(formatMoney(undefined)).toBe('');
  });

  it('é o inverso de parseMoney para valores comuns', () => {
    for (const cents of [1, 99, 100, 123456, -50000, -1]) {
      expect(parseMoney(formatMoney(cents))).toBe(cents);
    }
  });
});

describe('editableMoney', () => {
  it('usa vírgula e sem separador de milhar', () => {
    expect(editableMoney(123456)).toBe('1234,56');
    expect(editableMoney(-5000)).toBe('-50,00');
    expect(editableMoney(null)).toBe('');
  });
});
