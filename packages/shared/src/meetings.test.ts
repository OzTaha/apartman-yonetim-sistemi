import { describe, expect, it } from 'vitest';
import { decisionSchema, meetingQuorum, meetingSchema } from './meetings';

describe('meetingQuorum', () => {
  it('daire sayısı ve arsa payının yarısından fazlası katılınca yeter sayı sağlanır', () => {
    const q = meetingQuorum([
      { landShare: 40, status: 'PRESENT' },
      { landShare: 20, status: 'PROXY' },
      { landShare: 30, status: 'ABSENT' },
      { landShare: 10, status: 'ABSENT' },
    ]);
    expect(q).toMatchObject({
      totalUnits: 4,
      presentUnits: 2,
      proxyUnits: 1,
      totalLandShare: 100,
      presentLandShare: 60,
      missingLandShareUnits: 0,
      unitsMajority: false,
      landShareMajority: true,
      reached: false,
    });
  });

  it('arsa payı çoğunluğu yoksa daire çoğunluğu yetmez', () => {
    const q = meetingQuorum([
      { landShare: 10, status: 'PRESENT' },
      { landShare: 10, status: 'PRESENT' },
      { landShare: 70, status: 'ABSENT' },
    ]);
    expect(q.unitsMajority).toBe(true);
    expect(q.landShareMajority).toBe(false);
    expect(q.reached).toBe(false);
  });

  it('arsa payı eksikse yalnızca daire sayısına bakılır', () => {
    const q = meetingQuorum([
      { landShare: null, status: 'PRESENT' },
      { landShare: 10, status: 'PRESENT' },
      { landShare: 10, status: 'ABSENT' },
    ]);
    expect(q.totalLandShare).toBeNull();
    expect(q.missingLandShareUnits).toBe(1);
    expect(q.landShareMajority).toBeNull();
    expect(q.reached).toBe(true);
  });

  it('dairesiz yerde yeter sayı yoktur', () => {
    expect(meetingQuorum([]).reached).toBe(false);
  });
});

describe('meeting şemaları', () => {
  it('ikinci toplantı birinciden sonra olmalıdır', () => {
    const base = {
      kind: 'ORDINARY',
      location: 'Yönetim ofisi',
      items: [{ title: 'Açılış' }],
    };
    expect(
      meetingSchema.safeParse({
        ...base,
        startsAt: '2026-10-10T14:00',
        secondStartsAt: '2026-10-17T14:00',
      }).success,
    ).toBe(true);
    expect(
      meetingSchema.safeParse({
        ...base,
        startsAt: '2026-10-10T14:00',
        secondStartsAt: '2026-10-10T13:00',
      }).success,
    ).toBe(false);
  });

  it('bilgilendirme maddesinde oy girilmez', () => {
    expect(
      decisionSchema.safeParse({ result: 'INFO', resolution: 'Rapor okundu.', votesFor: 3 })
        .success,
    ).toBe(false);
    expect(
      decisionSchema.safeParse({
        result: 'ACCEPTED',
        resolution: 'Oy birliğiyle kabul.',
        votesFor: 3,
      }).success,
    ).toBe(true);
  });
});
