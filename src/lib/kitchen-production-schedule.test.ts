import { describe, expect, it } from 'vitest';
import { finishedSku } from './kitchen-bom';
import {
  addProductionDaysSkippingSundays,
  computeKitchenProductionSchedule,
  demandFrom75gBottleTotals,
  KITCHEN_DAILY_SESSION_LIMIT,
  SESSION_BOTTLES_PER_FLAVOR,
  stockFromFinishedRows,
} from './kitchen-production-schedule';

describe('addProductionDaysSkippingSundays', () => {
  it('returns start date when days is 0', () => {
    expect(addProductionDaysSkippingSundays('2026-09-06', 0)).toBe('2026-09-06');
  });

  it('skips Sundays when advancing production days', () => {
    // 2026-09-05 is Saturday; +1 day → Monday 2026-09-07 (skip Sunday)
    expect(addProductionDaysSkippingSundays('2026-09-05', 1)).toBe('2026-09-07');
    // Friday +2 production days → Monday (skip Sunday)
    expect(addProductionDaysSkippingSundays('2026-09-04', 2)).toBe('2026-09-07');
  });
});

describe('computeKitchenProductionSchedule', () => {
  it('computes shortfall, sessions, and summary totals', () => {
    const schedule = computeKitchenProductionSchedule(
      { red_date: 250, osmanthus: 50, rock_sugar: 0 },
      { red_date: 100, osmanthus: 200, rock_sugar: 30 },
      '2026-09-04',
    );

    const red = schedule.rows.find((r) => r.flavor === 'red_date');
    const osm = schedule.rows.find((r) => r.flavor === 'osmanthus');
    const sugar = schedule.rows.find((r) => r.flavor === 'rock_sugar');

    expect(red).toMatchObject({ demand: 250, stock: 100, shortfall: 150, sessions: 2 });
    expect(osm).toMatchObject({ demand: 50, stock: 200, shortfall: 0, sessions: null });
    expect(sugar).toMatchObject({ demand: 0, stock: 30, shortfall: 0, sessions: null });
    expect(schedule.totalSessions).toBe(2);
    expect(schedule.totalDaysNeeded).toBe(Math.ceil(2 / KITCHEN_DAILY_SESSION_LIMIT));
    expect(schedule.estimatedCompletionDate).toBe('2026-09-05');
  });

  it('uses flavor-specific session bottle limits', () => {
    expect(SESSION_BOTTLES_PER_FLAVOR.red_date).toBe(100);
    expect(SESSION_BOTTLES_PER_FLAVOR.osmanthus).toBe(110);
    expect(SESSION_BOTTLES_PER_FLAVOR.rock_sugar).toBe(110);
  });
});

describe('demandFrom75gBottleTotals', () => {
  it('maps only 75g tall SKUs', () => {
    const demand = demandFrom75gBottleTotals([
      { sku: finishedSku('75g', 'red_date'), qty: 12 },
      { sku: finishedSku('75g', 'osmanthus'), qty: 8 },
      { sku: finishedSku('45g', 'rock_sugar'), qty: 99 },
    ]);
    expect(demand).toEqual({ red_date: 12, osmanthus: 8, rock_sugar: 0 });
  });
});

describe('stockFromFinishedRows', () => {
  it('reads finished inventory quantities', () => {
    const stock = stockFromFinishedRows([
      { sku: finishedSku('75g', 'rock_sugar'), quantity: 40 },
      { sku: finishedSku('75g_big_belly', 'rock_sugar'), quantity: 99 },
    ]);
    expect(stock.rock_sugar).toBe(40);
    expect(stock.red_date).toBe(0);
  });
});
