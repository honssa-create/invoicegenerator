import { describe, expect, it } from 'vitest';
import {
  defaultPrepStatusForCreate,
  getPrepStatusAction,
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
  it('sets daily and restock creates to scheduled', () => {
    expect(defaultPrepStatusForCreate('daily', '2099-01-01', { today: '2026-08-03' })).toBe('scheduled');
    expect(defaultPrepStatusForCreate('daily', '2020-01-01', { today: '2026-08-03' })).toBe('scheduled');
    expect(defaultPrepStatusForCreate('restock', '2099-01-01', { today: '2026-08-03' })).toBe('scheduled');
  });

  it('sets wedding without production date to not_started', () => {
    expect(
      weddingPrepStatusFromDate('2026-08-03', { hasProductionDate: false, today: '2026-08-03' })
    ).toBe('not_started');
  });

  it('sets wedding future production date to not_started', () => {
    expect(
      weddingPrepStatusFromDate('2026-08-20', { hasProductionDate: true, today: '2026-08-03' })
    ).toBe('not_started');
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

describe('getPrepStatusAction', () => {
  it('maps workflow statuses to actions', () => {
    expect(getPrepStatusAction('scheduled')).toMatchObject({
      type: 'advance',
      nextStatus: 'prepped',
      label: '完成備料',
    });
    expect(getPrepStatusAction('prepped')).toMatchObject({
      type: 'advance',
      nextStatus: 'stewing',
      label: '開始炖製',
    });
    expect(getPrepStatusAction('stewing')).toMatchObject({
      type: 'complete',
      label: '完成炖製',
    });
    expect(getPrepStatusAction('not_started')).toBeNull();
    expect(getPrepStatusAction('completed')).toBeNull();
  });
});
