import { describe, expect, it } from 'vitest';
import { finishedSku, GIFT_BOX_BOMS } from './kitchen-bom';
import {
  addProductionDaysSkippingSundays,
  computeKitchenProductionSchedule,
  demandFrom75gBottleTotals,
  giftBoxBottlesByScheduleFlavor,
  giftBoxSupplyByScheduleFlavor,
  grossDemandFromRemainingGiftBoxes,
  KITCHEN_DAILY_SESSION_LIMIT,
  netProductionScheduleInputs,
  scheduleFlavorForGiftBoxFinishedSku,
  SESSION_BOTTLES_PER_FLAVOR,
  stockFromFinishedRows,
} from './kitchen-production-schedule';

describe('addProductionDaysSkippingSundays', () => {
  it('returns start date when days is 0', () => {
    expect(addProductionDaysSkippingSundays('2026-09-06', 0)).toBe('2026-09-06');
  });

  it('skips Sundays when advancing production days', () => {
    expect(addProductionDaysSkippingSundays('2026-09-05', 1)).toBe('2026-09-07');
    expect(addProductionDaysSkippingSundays('2026-09-04', 2)).toBe('2026-09-07');
  });
});

describe('scheduleFlavorForGiftBoxFinishedSku', () => {
  it('maps star gold 大肚樽 to 75g tall osmanthus for schedule', () => {
    expect(
      scheduleFlavorForGiftBoxFinishedSku(
        'star_gold',
        finishedSku('75g_big_belly', 'osmanthus'),
      ),
    ).toBe('osmanthus');
    expect(
      scheduleFlavorForGiftBoxFinishedSku(
        'star_silver',
        finishedSku('75g_big_belly', 'rock_sugar'),
      ),
    ).toBe('rock_sugar');
  });

  it('ignores 45g SKUs for schedule', () => {
    expect(
      scheduleFlavorForGiftBoxFinishedSku('trial_set', finishedSku('45g', 'osmanthus')),
    ).toBeNull();
  });
});

describe('giftBoxBottlesByScheduleFlavor', () => {
  it('counts star gold as 75g tall osmanthus bottles', () => {
    const totals = giftBoxBottlesByScheduleFlavor('star_gold', 2, GIFT_BOX_BOMS);
    expect(totals).toEqual({ red_date: 0, osmanthus: 6, rock_sugar: 0 });
  });

  it('counts hua yue as 75g tall one of each flavor', () => {
    const totals = giftBoxBottlesByScheduleFlavor('hua_yue', 1, GIFT_BOX_BOMS);
    expect(totals).toEqual({ red_date: 1, osmanthus: 1, rock_sugar: 1 });
  });
});

describe('grossDemandFromRemainingGiftBoxes', () => {
  it('uses remaining unfulfilled gift-box qty only', () => {
    const fulfillments = new Map<string, number>([['1::gift:star_gold', 1]]);
    const gross = grossDemandFromRemainingGiftBoxes(
      [
        {
          id: 1,
          fields: { nestiee_gift_qty_star_gold: '3' },
        },
      ],
      [{ id: 'star_gold', qtyKey: 'nestiee_gift_qty_star_gold', active: true }],
      GIFT_BOX_BOMS,
      fulfillments,
    );
    expect(gross.osmanthus).toBe(6);
  });
});

describe('netProductionScheduleInputs', () => {
  it('reduces demand by gift-box bottles per flavor; shortfall uses gross − gift − loose', () => {
    const net = netProductionScheduleInputs(
      { red_date: 0, osmanthus: 100, rock_sugar: 0 },
      { red_date: 0, osmanthus: 30, rock_sugar: 0 },
      { red_date: 0, osmanthus: 20, rock_sugar: 0 },
    );
    expect(net.netDemand.osmanthus).toBe(70);
    expect(net.netStock.osmanthus).toBe(20);
  });
});

describe('computeKitchenProductionSchedule', () => {
  it('computes shortfall from gross − gift − loose when breakdown provided', () => {
    const schedule = computeKitchenProductionSchedule(
      { red_date: 70, osmanthus: 50, rock_sugar: 0 },
      { red_date: 100, osmanthus: 200, rock_sugar: 30 },
      '2026-09-04',
      { red_date: 250, osmanthus: 50, rock_sugar: 0 },
      { red_date: 0, osmanthus: 0, rock_sugar: 0 },
    );

    const red = schedule.rows.find((r) => r.flavor === 'red_date');
    const osm = schedule.rows.find((r) => r.flavor === 'osmanthus');
    const sugar = schedule.rows.find((r) => r.flavor === 'rock_sugar');

    expect(red).toMatchObject({ demand: 70, stock: 100, shortfall: 150, sessions: 2 });
    expect(osm).toMatchObject({ demand: 50, stock: 200, shortfall: 0, sessions: null });
    expect(sugar).toMatchObject({ demand: 0, stock: 30, shortfall: 0, sessions: null });
    expect(schedule.totalSessions).toBe(2);
    expect(schedule.totalDaysNeeded).toBe(Math.ceil(2 / KITCHEN_DAILY_SESSION_LIMIT));
    expect(schedule.estimatedCompletionDate).toBe('2026-09-05');
  });

  it('nets gift-box supply against gross demand for sessions', () => {
    const schedule = computeKitchenProductionSchedule(
      { red_date: 0, osmanthus: 70, rock_sugar: 0 },
      { red_date: 0, osmanthus: 20, rock_sugar: 0 },
      '2026-09-04',
      { red_date: 0, osmanthus: 100, rock_sugar: 0 },
      { red_date: 0, osmanthus: 30, rock_sugar: 0 },
    );
    const osm = schedule.rows.find((r) => r.flavor === 'osmanthus');
    expect(osm).toMatchObject({ demand: 70, stock: 20, shortfall: 50, sessions: 1 });
  });

  it('uses flavor-specific session bottle limits', () => {
    expect(SESSION_BOTTLES_PER_FLAVOR.red_date).toBe(100);
    expect(SESSION_BOTTLES_PER_FLAVOR.osmanthus).toBe(110);
    expect(SESSION_BOTTLES_PER_FLAVOR.rock_sugar).toBe(110);
  });
});

describe('giftBoxSupplyByScheduleFlavor', () => {
  it('aggregates on-hand gift boxes by flavor', () => {
    const supply = giftBoxSupplyByScheduleFlavor(
      [{ boxType: 'star_gold', quantity: 2 }],
      GIFT_BOX_BOMS,
    );
    expect(supply.osmanthus).toBe(6);
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
