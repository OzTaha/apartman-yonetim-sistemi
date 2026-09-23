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
