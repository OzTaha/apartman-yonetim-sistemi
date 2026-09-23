export function normalizeTrPhone(input: string): string | null {
  const digits = input.replace(/[\s\-().]/g, '');
  if (!/^\+?\d+$/.test(digits)) return null;

  let national: string;
  if (digits.startsWith('+90')) national = digits.slice(3);
  else if (digits.startsWith('90') && digits.length === 12) national = digits.slice(2);
  else if (digits.startsWith('0') && digits.length === 11) national = digits.slice(1);
  else if (digits.startsWith('+')) return null;
  else national = digits;

  if (!/^[2-5]\d{9}$/.test(national)) return null;
  return `+90${national}`;
}

export function formatTrPhone(e164: string): string {
  const national = e164.startsWith('+90') ? e164.slice(3) : e164;
  if (national.length !== 10) return e164;
  return `0${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6, 8)} ${national.slice(8)}`;
}
