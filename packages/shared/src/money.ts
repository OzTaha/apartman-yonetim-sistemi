export type Kurus = number;

const tryFormatter = new Intl.NumberFormat('tr-TR', {
  style: 'currency',
  currency: 'TRY',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function assertKurus(value: number): asserts value is Kurus {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Tutar kuruş cinsinden tam sayı olmalıdır: ${value}`);
  }
}

export function formatKurus(kurus: Kurus): string {
  assertKurus(kurus);
  return tryFormatter.format(kurus / 100);
}

export function parseTlToKurus(input: string): Kurus {
  const raw = input.trim().replace(/\s|₺|TL/gi, '');
  if (raw === '') throw new RangeError('Tutar boş olamaz');

  const negative = raw.startsWith('-');
  const unsigned = negative ? raw.slice(1) : raw;

  let normalized: string;
  if (unsigned.includes(',')) {
    normalized = unsigned.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(unsigned)) {
    normalized = unsigned.replace(/\./g, '');
  } else {
    normalized = unsigned;
  }

  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) throw new RangeError(`Geçersiz tutar: ${input}`);

  const lira = Number(match[1]);
  const kurusPart = Number((match[2] ?? '').padEnd(2, '0'));
  const total = lira * 100 + kurusPart;
  assertKurus(total);
  return negative ? -total : total;
}

const plainFormatter = new Intl.NumberFormat('tr-TR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatKurusTl(kurus: Kurus): string {
  assertKurus(kurus);
  return `${plainFormatter.format(kurus / 100)} TL`;
}

export function kurusToInput(kurus: Kurus): string {
  assertKurus(kurus);
  return (kurus / 100).toFixed(2).replace('.', ',');
}

const ONES = ['', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz'];
const TENS = ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan'];
const SCALES = ['', 'bin', 'milyon', 'milyar'];

function hundredsToWords(n: number): string[] {
  const words: string[] = [];
  const hundreds = Math.floor(n / 100);
  if (hundreds > 1) words.push(ONES[hundreds]!);
  if (hundreds > 0) words.push('yüz');
  const rest = n % 100;
  if (rest >= 10) words.push(TENS[Math.floor(rest / 10)]!);
  if (rest % 10 > 0) words.push(ONES[rest % 10]!);
  return words;
}

export function integerToWordsTr(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`Geçersiz sayı: ${value}`);
  }
  if (value === 0) return 'sıfır';
  const groups: number[] = [];
  for (let n = value; n > 0; n = Math.floor(n / 1000)) groups.push(n % 1000);
  if (groups.length > SCALES.length) throw new RangeError(`Sayı çok büyük: ${value}`);

  const words: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const group = groups[i]!;
    if (group === 0) continue;
    if (!(i === 1 && group === 1)) words.push(...hundredsToWords(group));
    if (SCALES[i]) words.push(SCALES[i]!);
  }
  return words.join(' ');
}

export function kurusToWordsTr(kurus: Kurus): string {
  assertKurus(kurus);
  if (kurus < 0) throw new RangeError('Negatif tutar yazıyla yazılamaz');
  const lira = Math.floor(kurus / 100);
  const rest = kurus % 100;
  const parts: string[] = [];
  if (lira > 0 || rest === 0) parts.push(`${integerToWordsTr(lira)} Türk lirası`);
  if (rest > 0) parts.push(`${integerToWordsTr(rest)} kuruş`);
  return parts.join(' ');
}
