import { describe, expect, it } from 'vitest';

import {
  composePaymentMonth,
  formatDateBr,
  formatMonthPart,
  formatYearPart,
  formatPaymentMonth,
  isMonthKey,
  parseDateCell,
  parseMonthPart,
  parseYearPart,
  paymentParts,
  monthLabel,
  parseDateInput,
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

describe('parseDateInput', () => {
  it.each([
    ['19/10/2026', '2026-10-19'],
    ['1/2/2026', '2026-02-01'],
    ['19/10/26', '2026-10-19'],
    ['19-10-2026', '2026-10-19'],
    ['19.10.2026', '2026-10-19'],
    ['2026-10-19', '2026-10-19'],
    ['  05/03/2027 ', '2027-03-05'],
    ['29/02/2028', '2028-02-29'], // ano bissexto
  ])('interpreta %j como %s', (input, expected) => {
    expect(parseDateInput(input)).toBe(expected);
  });

  it.each([
    '',
    '31/02/2026',
    '29/02/2027',
    '00/10/2026',
    '10/13/2026',
    '2026',
    'abc',
    '1/1/1800',
    null,
    undefined,
  ])(
    'devolve null para %j (data inexistente ou formato desconhecido)',
    (input) => {
      expect(parseDateInput(input as string | null | undefined)).toBeNull();
    },
  );
});

describe('formatDateBr', () => {
  it('mostra dia/mês/ano', () => {
    expect(formatDateBr('2026-10-19')).toBe('19/10/2026');
    expect(formatDateBr(null)).toBe('');
  });

  it('é o inverso de parseDateInput', () => {
    expect(parseDateInput(formatDateBr('2026-01-05'))).toBe('2026-01-05');
  });
});

describe('parseMonthPart (coluna "Mês Pagamento")', () => {
  it.each([
    ['JAN', 1],
    ['jan', 1],
    ['Fev', 2],
    ['MAR', 3],
    ['dez', 12],
    ['outubro', 10],
    ['Março', 3],
    ['marco', 3],
    ['10', 10],
    ['1', 1],
    ['12', 12],
  ])('%j vira o mês %i', (input, expected) => {
    expect(parseMonthPart(input)).toBe(expected);
  });

  it('vazio é null; o que não for mês vira marcador de inválido', () => {
    expect(parseMonthPart('')).toBeNull();
    expect(parseMonthPart('   ')).toBeNull();
    expect(parseMonthPart('13')).toBe('?:13');
    expect(parseMonthPart('0')).toBe('?:0');
    expect(parseMonthPart('xyz')).toBe('?:xyz');
  });
});

describe('parseYearPart (coluna "Ano Pagamento")', () => {
  it('aceita 4 ou 2 dígitos', () => {
    expect(parseYearPart('2026')).toBe(2026);
    expect(parseYearPart('26')).toBe(2026);
    expect(parseYearPart(' 2027 ')).toBe(2027);
  });

  it('vazio é null; o resto vira marcador', () => {
    expect(parseYearPart('')).toBeNull();
    expect(parseYearPart('202')).toBe('?:202');
    expect(parseYearPart('abcd')).toBe('?:abcd');
    expect(parseYearPart('1800')).toBe('?:1800');
  });
});

describe('formatMonthPart / formatYearPart', () => {
  it('mostra JAN..DEZ e o ano; marcadores aparecem com aviso', () => {
    expect(formatMonthPart(10)).toBe('OUT');
    expect(formatMonthPart(null)).toBe('');
    expect(formatMonthPart('?:xyz')).toBe('⚠ xyz');
    expect(formatYearPart(2026)).toBe('2026');
    expect(formatYearPart('?:20x')).toBe('⚠ 20x');
  });
});

describe('paymentParts / composePaymentMonth', () => {
  it('são inversos', () => {
    expect(paymentParts('2026-10-01')).toEqual({ month: 10, year: 2026 });
    expect(composePaymentMonth(10, 2026)).toBe('2026-10-01');
    expect(composePaymentMonth(3, 2027)).toBe('2027-03-01');
  });

  it('só compõe quando mês e ano são números válidos', () => {
    expect(composePaymentMonth(null, 2026)).toBeNull();
    expect(composePaymentMonth(10, null)).toBeNull();
    expect(composePaymentMonth('?:x', 2026)).toBeNull();
    expect(paymentParts(null)).toEqual({ month: null, year: null });
  });
});

describe('parseDateCell', () => {
  it('data válida vira ISO, vazio vira null e lixo vira marcador', () => {
    expect(parseDateCell('19/10/2026')).toBe('2026-10-19');
    expect(parseDateCell('')).toBeNull();
    expect(parseDateCell('31/02/2026')).toBe('?:31/02/2026');
    expect(parseDateCell('ontem')).toBe('?:ontem');
  });
});
