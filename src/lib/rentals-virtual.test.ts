import { describe, expect, it } from 'vitest';
import {
  buildVirtualRentRecord,
  displayRentalStatus,
  dueDateForPeriod,
  isVirtualRentRecord,
} from './rentals';

describe('buildVirtualRentRecord', () => {
  it('returns id 0 pending card with lease base rent when period is in lease', () => {
    const rec = buildVirtualRentRecord(
      { id: 3, user_id: 1, currentYearRent: 10000, dueDateDay: 1 },
      '2026-04',
      {
        baseRent: 12000,
        dueDateDay: 5,
        leaseStartDate: '2025-01-01',
        leaseEndDate: '2027-12-31',
      },
    );
    expect(rec.id).toBe(0);
    expect(isVirtualRentRecord(rec)).toBe(true);
    expect(rec.status).toBe('pending');
    expect(rec.baseRent).toBe(12000);
    expect(rec.actualAmount).toBe(12000);
    expect(rec.amountPaid).toBe(0);
    expect(rec.billingPeriod).toBe('2026-04');
    expect(rec.unitId).toBe(3);
    expect(rec.baseRentPeriodFrom).toBeTruthy();
    expect(rec.baseRentPeriodTo).toBeTruthy();
  });

  it('falls back to unit rent when no lease', () => {
    const rec = buildVirtualRentRecord(
      { id: 1, user_id: 9, currentYearRent: 8000, dueDateDay: 1 },
      '2026-08',
      null,
    );
    expect(rec.baseRent).toBe(8000);
    expect(rec.user_id).toBe(9);
  });
});

describe('displayRentalStatus overdue on read', () => {
  it('marks unpaid past-due as overdue without stored overdue status', () => {
    const period = '2026-01';
    const dueDateDay = 1;
    const due = dueDateForPeriod(period, dueDateDay);
    expect(
      displayRentalStatus(
        { status: 'pending', actualAmount: 1000, amountPaid: 0, billingPeriod: period },
        { dueDateDay, period, today: '2026-01-15' },
      ),
    ).toBe('overdue');
    // Sanity: due date is before today used above
    expect(due < '2026-01-15').toBe(true);
  });

  it('stays pending before due date', () => {
    expect(
      displayRentalStatus(
        { status: 'pending', actualAmount: 1000, amountPaid: 0, billingPeriod: '2026-08' },
        { dueDateDay: 20, period: '2026-08', today: '2026-08-10' },
      ),
    ).toBe('pending');
  });

  it('keeps paid and partial', () => {
    expect(
      displayRentalStatus(
        { status: 'pending', actualAmount: 1000, amountPaid: 1000, billingPeriod: '2026-01' },
        { dueDateDay: 1, period: '2026-01', today: '2026-02-01' },
      ),
    ).toBe('paid');
    expect(
      displayRentalStatus(
        { status: 'pending', actualAmount: 1000, amountPaid: 200, billingPeriod: '2026-01' },
        { dueDateDay: 1, period: '2026-01', today: '2026-02-01' },
      ),
    ).toBe('partial');
  });
});
