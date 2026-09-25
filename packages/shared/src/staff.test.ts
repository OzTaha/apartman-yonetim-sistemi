import { describe, expect, it } from 'vitest';
import {
  addDays,
  describeRecurrence,
  formatDuration,
  isOvernight,
  isTaskOverdue,
  isoWeekday,
  recurrenceMatches,
  recurringTaskCreateSchema,
  shiftCopySchema,
  shiftListQuerySchema,
  shiftMinutes,
  shiftSchema,
  shiftsOverlap,
  taskStatusChangeSchema,
  weekDates,
  weekStartOf,
} from './staff';
import { transactionCreateSchema } from './finance';

const id = '0190a000-0000-7000-8000-000000000001';
const other = '0190a000-0000-7000-8000-000000000002';

describe('hafta yardımcıları', () => {
  it('haftanın gününü pazartesi 1, pazar 7 olarak verir', () => {
    expect(isoWeekday('2026-09-21')).toBe(1);
    expect(isoWeekday('2026-09-25')).toBe(5);
    expect(isoWeekday('2026-09-27')).toBe(7);
  });

  it('haftanın pazartesisini bulur, ay ve yıl geçişini doğru yapar', () => {
    expect(weekStartOf('2026-09-25')).toBe('2026-09-21');
    expect(weekStartOf('2026-09-21')).toBe('2026-09-21');
    expect(weekStartOf('2026-09-27')).toBe('2026-09-21');
    expect(weekStartOf('2027-01-01')).toBe('2026-12-28');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('haftanın 7 gününü sırayla verir', () => {
    expect(weekDates('2026-09-28')).toEqual([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ]);
  });
});

describe('vardiya süresi ve çakışma', () => {
  it('gündüz ve gece vardiyasının süresini hesaplar', () => {
    expect(shiftMinutes('08:00', '17:30')).toBe(570);
    expect(shiftMinutes('20:00', '08:00')).toBe(720);
    expect(shiftMinutes('00:00', '00:30')).toBe(30);
    expect(isOvernight('20:00', '08:00')).toBe(true);
    expect(isOvernight('08:00', '17:00')).toBe(false);
  });

  it('süreyi saat ve dakika olarak yazar', () => {
    expect(formatDuration(570)).toBe('9 sa 30 dk');
    expect(formatDuration(480)).toBe('8 sa');
    expect(formatDuration(45)).toBe('45 dk');
  });

  it('aynı gün kesişen vardiyaları çakışma sayar, uç uca olanları saymaz', () => {
    const morning = { date: '2026-09-21', startTime: '08:00', endTime: '16:00' };
    expect(
      shiftsOverlap(morning, { date: '2026-09-21', startTime: '15:00', endTime: '20:00' }),
    ).toBe(true);
    expect(
      shiftsOverlap(morning, { date: '2026-09-21', startTime: '16:00', endTime: '20:00' }),
    ).toBe(false);
  });

  it('ertesi güne taşan gece vardiyasını sonraki günün sabahıyla karşılaştırır', () => {
    const night = { date: '2026-09-21', startTime: '20:00', endTime: '08:00' };
    expect(shiftsOverlap(night, { date: '2026-09-22', startTime: '07:00', endTime: '12:00' })).toBe(
      true,
    );
    expect(shiftsOverlap(night, { date: '2026-09-22', startTime: '08:00', endTime: '12:00' })).toBe(
      false,
    );
    expect(shiftsOverlap(night, { date: '2026-09-20', startTime: '20:00', endTime: '08:00' })).toBe(
      false,
    );
  });
});

describe('vardiya şemaları', () => {
  it('saat biçimini ve aynı başlangıç-bitişi reddeder', () => {
    const base = { employeeId: id, date: '2026-09-21' };
    expect(shiftSchema.safeParse({ ...base, startTime: '8:00', endTime: '17:00' }).success).toBe(
      false,
    );
    expect(shiftSchema.safeParse({ ...base, startTime: '24:00', endTime: '08:00' }).success).toBe(
      false,
    );
    expect(shiftSchema.safeParse({ ...base, startTime: '08:00', endTime: '08:00' }).success).toBe(
      false,
    );
    expect(shiftSchema.safeParse({ ...base, startTime: '20:00', endTime: '08:00' }).success).toBe(
      true,
    );
  });

  it('liste aralığını sınırlar', () => {
    expect(shiftListQuerySchema.safeParse({ from: '2026-09-21', to: '2026-09-27' }).success).toBe(
      true,
    );
    expect(shiftListQuerySchema.safeParse({ from: '2026-09-21', to: '2026-12-31' }).success).toBe(
      false,
    );
    expect(shiftListQuerySchema.safeParse({ from: '2026-09-21', to: '2026-09-20' }).success).toBe(
      false,
    );
  });

  it('kopyalamada haftaların pazartesi olmasını ister', () => {
    expect(
      shiftCopySchema.safeParse({ sourceWeek: '2026-09-21', targetWeek: '2026-09-28' }).success,
    ).toBe(true);
    expect(
      shiftCopySchema.safeParse({ sourceWeek: '2026-09-22', targetWeek: '2026-09-28' }).success,
    ).toBe(false);
    expect(
      shiftCopySchema.safeParse({ sourceWeek: '2026-09-21', targetWeek: '2026-09-21' }).success,
    ).toBe(false);
  });
});

describe('görevler', () => {
  it('son tarihi geçmiş açık görevi gecikmiş sayar', () => {
    const today = '2026-09-25';
    expect(isTaskOverdue({ status: 'TODO', dueDate: '2026-09-24' }, today)).toBe(true);
    expect(isTaskOverdue({ status: 'IN_PROGRESS', dueDate: '2026-09-24' }, today)).toBe(true);
    expect(isTaskOverdue({ status: 'TODO', dueDate: '2026-09-25' }, today)).toBe(false);
    expect(isTaskOverdue({ status: 'DONE', dueDate: '2026-09-01' }, today)).toBe(false);
    expect(isTaskOverdue({ status: 'TODO', dueDate: null }, today)).toBe(false);
  });

  it('iptalde neden ister', () => {
    expect(taskStatusChangeSchema.safeParse({ status: 'CANCELLED' }).success).toBe(false);
    expect(
      taskStatusChangeSchema.safeParse({ status: 'CANCELLED', note: 'Gerek kalmadı' }).success,
    ).toBe(true);
    expect(taskStatusChangeSchema.safeParse({ status: 'DONE' }).success).toBe(true);
  });
});

describe('tekrarlayan görevler', () => {
  const rule = {
    frequency: 'WEEKLY' as const,
    weekdays: [2, 5],
    dayOfMonth: null,
    startDate: '2026-09-01',
    endDate: '2026-12-31',
  };

  it('haftalık kuralı seçili günlerde eşleştirir', () => {
    expect(recurrenceMatches(rule, '2026-09-22')).toBe(true);
    expect(recurrenceMatches(rule, '2026-09-25')).toBe(true);
    expect(recurrenceMatches(rule, '2026-09-23')).toBe(false);
  });

  it('başlangıçtan önce ve bitişten sonra eşleşmez', () => {
    expect(recurrenceMatches(rule, '2026-08-28')).toBe(false);
    expect(recurrenceMatches(rule, '2027-01-01')).toBe(false);
    expect(recurrenceMatches({ ...rule, endDate: null }, '2027-01-01')).toBe(true);
  });

  it('günlük ve aylık kuralları eşleştirir', () => {
    expect(recurrenceMatches({ ...rule, frequency: 'DAILY' }, '2026-09-23')).toBe(true);
    const monthly = { ...rule, frequency: 'MONTHLY' as const, dayOfMonth: 5 };
    expect(recurrenceMatches(monthly, '2026-10-05')).toBe(true);
    expect(recurrenceMatches(monthly, '2026-10-06')).toBe(false);
  });

  it('kuralı Türkçe açıklar', () => {
    expect(describeRecurrence(rule)).toBe('Her salı ve cuma');
    expect(describeRecurrence({ ...rule, weekdays: [1, 3, 5] })).toBe(
      'Her pazartesi, çarşamba ve cuma',
    );
    expect(describeRecurrence({ ...rule, weekdays: [5, 4, 3, 2, 1] })).toBe('Hafta içi her gün');
    expect(describeRecurrence({ ...rule, frequency: 'DAILY' })).toBe('Her gün');
    expect(describeRecurrence({ ...rule, frequency: 'MONTHLY', dayOfMonth: 15 })).toBe(
      'Her ayın 15. günü',
    );
  });

  it('haftalıkta gün, aylıkta ayın gününü zorunlu tutar', () => {
    const base = { title: 'Merdiven temizliği', startDate: '2026-09-01' };
    expect(recurringTaskCreateSchema.safeParse({ ...base, frequency: 'WEEKLY' }).success).toBe(
      false,
    );
    expect(recurringTaskCreateSchema.safeParse({ ...base, frequency: 'MONTHLY' }).success).toBe(
      false,
    );
    expect(
      recurringTaskCreateSchema.safeParse({ ...base, frequency: 'MONTHLY', dayOfMonth: 29 })
        .success,
    ).toBe(false);
    expect(
      recurringTaskCreateSchema.safeParse({ ...base, frequency: 'WEEKLY', weekdays: [2] }).success,
    ).toBe(true);
  });
});

describe('çalışana bağlı gider', () => {
  const base = {
    accountId: id,
    categoryId: id,
    amountKurus: 100,
    date: '2026-09-25',
    employeeId: other,
  };

  it('yalnızca gider çalışana bağlanabilir ve firma ile birlikte seçilemez', () => {
    expect(transactionCreateSchema.safeParse({ ...base, type: 'EXPENSE' }).success).toBe(true);
    expect(transactionCreateSchema.safeParse({ ...base, type: 'INCOME' }).success).toBe(false);
    expect(
      transactionCreateSchema.safeParse({ ...base, type: 'EXPENSE', vendorId: id }).success,
    ).toBe(false);
  });
});
