import { describe, expect, it } from 'vitest';
import {
  defaultPrepStatusForCreate,
  hkNowDateTime,
  weddingPrepStatusFromDate,
} from './kitchen-prep';

describe('hkNowDateTime', () => {
  it('formats Asia/Hong_Kong wall time as YYYY-MM-DD HH:mm:ss', () => {
    // 2026-08-19T08:05:09Z → 16:05:09 HKT
    expect(hkNowDateTime(new Date('2026-08-19T08:05:09.000Z'))).toBe('2026-08-19 16:05:09');
  });
});

describe('defaultPrepStatusForCreate', () => {
  it('sets daily and restock creates to in_prep', () => {
    expect(defaultPrepStatusForCreate('daily', '2099-01-01', { today: '2026-08-03' })).toBe('in_prep');
    expect(defaultPrepStatusForCreate('daily', '2020-01-01', { today: '2026-08-03' })).toBe('in_prep');
    expect(defaultPrepStatusForCreate('restock', '2099-01-01', { today: '2026-08-03' })).toBe('in_prep');
  });

  it('sets wedding without production date to inactive', () => {
    expect(
      weddingPrepStatusFromDate('2026-08-03', { hasProductionDate: false, today: '2026-08-03' })
    ).toBe('inactive');
  });

  it('sets wedding future production date to inactive', () => {
    expect(
      weddingPrepStatusFromDate('2026-08-20', { hasProductionDate: true, today: '2026-08-03' })
    ).toBe('inactive');
  });

  it('sets wedding due production date to scheduled', () => {
    expect(
      weddingPrepStatusFromDate('2026-08-03', { hasProductionDate: true, today: '2026-08-03' })
    ).toBe('scheduled');
    expect(
      weddingPrepStatusFromDate('2026-07-01', { hasProductionDate: true, today: '2026-08-03' })
    ).toBe('scheduled');
  });
});
