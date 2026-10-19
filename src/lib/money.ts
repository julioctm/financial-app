// Money is stored as integer cents (negative = expense). These helpers convert
// to and from the pt-BR text users type, paste from spreadsheets or see on screen.

export function formatMoney(cents: number | null | undefined): string {
  if (cents == null) return '';
  return (cents / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// "1.234,56", "1234,56", "1234.56", "-50", "R$ 10,5" -> cents; null when unparseable.
export function parseMoney(input: string | null | undefined): number | null {
  if (input == null) return null;
  let s = input.replace(/\s|R\$/g, '');
  if (!s) return null;
  const negative = s.startsWith('-') || (s.startsWith('(') && s.endsWith(')'));
  s = s.replace(/^[-+(]/, '').replace(/\)$/, '');

  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (!/^\d+(\.\d{1,2})?$/.test(s)) s = s.replace(/\./g, '');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;

  const [whole, frac = ''] = s.split('.');
  const padded = `${frac}000`;
  let cents = Number(whole) * 100 + Number(padded.slice(0, 2));
  if (Number(padded[2]) >= 5) cents += 1; // round half up
  return negative ? -cents : cents;
}

// Text for editing: keeps the comma and no thousands separator.
export function editableMoney(cents: number | null | undefined): string {
  return cents == null ? '' : (cents / 100).toFixed(2).replace('.', ',');
}
