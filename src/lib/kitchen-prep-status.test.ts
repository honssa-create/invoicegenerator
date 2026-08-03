import { describe, expect, it } from 'vitest';
import {
  defaultPrepStatusForCreate,
  weddingPrepStatusFromDate,
} from './kitchen-prep';

describe('defaultPrepStatusForCreate', () => {
  it('sets daily creates to in_prep', () => {
    expect(defaultPrepStatusForCreate('daily', '2099-01-01', { today: '2026-08-03' })).toBe('in_prep');
    expect(defaultPrepStatusForCreate('daily', '2020-01-01', { today: '2026-08-03' })).toBe('in_prep');
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
