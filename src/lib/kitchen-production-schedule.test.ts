import { describe, expect, it } from 'vitest';
import { finishedSku, GIFT_BOX_BOMS } from './kitchen-bom';
import {
  addProductionDaysSkippingSundays,
  computeKitchenProductionSchedule,
  demandFrom75gBottleTotals,
  emptySlotTotals,
  giftBoxBottlesByScheduleFlavor,
  giftBoxBottlesByScheduleSlot,
  giftBoxSupplyByScheduleFlavor,
  giftBoxSupplyByScheduleSlot,
  grossDemandFromRemainingGiftBoxes,
  KITCHEN_DAILY_SESSION_LIMIT,
  netProductionScheduleInputs,
  type ProductionScheduleSlotId,
  type ProductionScheduleSlotTotals,
  scheduleFlavorForGiftBoxFinishedSku,
  scheduleSlotForGiftBoxFinishedSku,
  SESSION_BOTTLES_PER_FLAVOR,
  stockFromFinishedRows,
} from './kitchen-production-schedule';

function slotTotals(partial: Partial<ProductionScheduleSlotTotals>): ProductionScheduleSlotTotals {
  const out = emptySlotTotals();
  for (const [key, value] of Object.entries(partial)) {
    out[key as ProductionScheduleSlotId] = value ?? 0;
  }
  return out;
}

describe('addProductionDaysSkippingSundays', () => {
  it('returns start date when days is 0', () => {
    expect(addProductionDaysSkippingSundays('2026-09-06', 0)).toBe('2026-09-06');
  });

  it('skips Sundays when advancing production days', () => {
    expect(addProductionDaysSkippingSundays('2026-09-05', 1)).toBe('2026-09-07');
    expect(addProductionDaysSkippingSundays('2026-09-04', 2)).toBe('2026-09-07');
  });
});

describe('scheduleSlotForGiftBoxFinishedSku', () => {
  it('maps star gold 大肚樽 to 75g tall osmanthus for schedule', () => {
    expect(
      scheduleSlotForGiftBoxFinishedSku(
        'star_gold',
        finishedSku('75g_big_belly', 'osmanthus'),
      ),
    ).toBe('75g:osmanthus');
    expect(
      scheduleSlotForGiftBoxFinishedSku(
        'star_silver',
        finishedSku('75g_big_belly', 'rock_sugar'),
      ),
    ).toBe('75g:rock_sugar');
  });

  it('maps 45g SKUs to 45g schedule slots', () => {
    expect(
      scheduleSlotForGiftBoxFinishedSku('trial_set', finishedSku('45g', 'osmanthus')),
    ).toBe('45g:osmanthus');
    expect(
      scheduleSlotForGiftBoxFinishedSku('rou_run_share_box', finishedSku('45g', 'red_date')),
    ).toBe('45g:red_date');
  });

  it('ignores 25g SKUs not on the schedule', () => {
    expect(
      scheduleSlotForGiftBoxFinishedSku('trial_set', finishedSku('25g', 'red_date')),
    ).toBeNull();
  });
});

describe('scheduleFlavorForGiftBoxFinishedSku (deprecated 75g-only)', () => {
  it('returns flavor for 75g tall slots only', () => {
    expect(
      scheduleFlavorForGiftBoxFinishedSku(
        'star_gold',
        finishedSku('75g_big_belly', 'osmanthus'),
      ),
    ).toBe('osmanthus');
    expect(
      scheduleFlavorForGiftBoxFinishedSku('trial_set', finishedSku('45g', 'osmanthus')),
    ).toBeNull();
  });
});

describe('giftBoxBottlesByScheduleSlot', () => {
  it('counts star gold as 75g tall osmanthus bottles', () => {
    const totals = giftBoxBottlesByScheduleSlot('star_gold', 2, GIFT_BOX_BOMS);
    expect(totals['75g:osmanthus']).toBe(6);
    expect(totals['45g:osmanthus']).toBe(0);
  });

  it('counts trial set as 45g bottles (one of each flavor)', () => {
    const totals = giftBoxBottlesByScheduleSlot('trial_set', 2, GIFT_BOX_BOMS);
    expect(totals['45g:red_date']).toBe(2);
    expect(totals['45g:osmanthus']).toBe(2);
    expect(totals['45g:rock_sugar']).toBe(2);
    expect(totals['75g:osmanthus']).toBe(0);
  });

  it('counts hua yue as 75g tall one of each flavor', () => {
    const totals = giftBoxBottlesByScheduleSlot('hua_yue', 1, GIFT_BOX_BOMS);
    expect(totals['75g:red_date']).toBe(1);
    expect(totals['75g:osmanthus']).toBe(1);
    expect(totals['75g:rock_sugar']).toBe(1);
  });
});

describe('giftBoxBottlesByScheduleFlavor (deprecated)', () => {
  it('counts star gold as 75g tall osmanthus bottles', () => {
    const totals = giftBoxBottlesByScheduleFlavor('star_gold', 2, GIFT_BOX_BOMS);
    expect(totals).toEqual({ red_date: 0, osmanthus: 6, rock_sugar: 0 });
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
    expect(gross['75g:osmanthus']).toBe(6);
  });

  it('includes 45g demand from trial set orders', () => {
    const gross = grossDemandFromRemainingGiftBoxes(
      [{ id: 2, fields: { nestiee_gift_qty_trial_set: '1' } }],
      [{ id: 'trial_set', qtyKey: 'nestiee_gift_qty_trial_set', active: true }],
      GIFT_BOX_BOMS,
      new Map(),
    );
    expect(gross['45g:red_date']).toBe(1);
    expect(gross['45g:osmanthus']).toBe(1);
    expect(gross['45g:rock_sugar']).toBe(1);
  });
});

describe('netProductionScheduleInputs', () => {
  it('reduces demand by gift-box bottles per slot; shortfall uses gross − gift − loose', () => {
    const net = netProductionScheduleInputs(
      slotTotals({ '75g:osmanthus': 100, '45g:rock_sugar': 10 }),
      slotTotals({ '75g:osmanthus': 30 }),
      slotTotals({ '75g:osmanthus': 20, '45g:rock_sugar': 5 }),
    );
    expect(net.netDemand['75g:osmanthus']).toBe(70);
    expect(net.netStock['75g:osmanthus']).toBe(20);
    expect(net.netDemand['45g:rock_sugar']).toBe(10);
    expect(net.netStock['45g:rock_sugar']).toBe(5);
  });
});

describe('computeKitchenProductionSchedule', () => {
  it('computes shortfall from gross − gift − loose when breakdown provided', () => {
    const schedule = computeKitchenProductionSchedule(
      slotTotals({ '75g:red_date': 70, '75g:osmanthus': 50 }),
      slotTotals({
        '75g:red_date': 100,
        '75g:osmanthus': 200,
        '75g:rock_sugar': 30,
      }),
      '2026-09-04',
      slotTotals({ '75g:red_date': 250, '75g:osmanthus': 50 }),
      slotTotals({}),
    );

    const red = schedule.rows.find((r) => r.slotId === '75g:red_date');
    const osm = schedule.rows.find((r) => r.slotId === '75g:osmanthus');
    const sugar = schedule.rows.find((r) => r.slotId === '75g:rock_sugar');

    expect(red).toMatchObject({ demand: 70, stock: 100, shortfall: 150, sessions: 2 });
    expect(osm).toMatchObject({ demand: 50, stock: 200, shortfall: 0, sessions: null });
    expect(sugar).toMatchObject({ demand: 0, stock: 30, shortfall: 0, sessions: null });
    expect(schedule.totalSessions).toBe(2);
    expect(schedule.totalDaysNeeded).toBe(Math.ceil(2 / KITCHEN_DAILY_SESSION_LIMIT));
    expect(schedule.estimatedCompletionDate).toBe('2026-09-05');
  });

  it('nets gift-box supply against gross demand for sessions', () => {
    const schedule = computeKitchenProductionSchedule(
      slotTotals({ '75g:osmanthus': 70 }),
      slotTotals({ '75g:osmanthus': 20 }),
      '2026-09-04',
      slotTotals({ '75g:osmanthus': 100 }),
      slotTotals({ '75g:osmanthus': 30 }),
    );
    const osm = schedule.rows.find((r) => r.slotId === '75g:osmanthus');
    expect(osm).toMatchObject({ demand: 70, stock: 20, shortfall: 50, sessions: 1 });
  });

  it('includes 45g and 25g rows without session counts', () => {
    const schedule = computeKitchenProductionSchedule(
      slotTotals({ '45g:osmanthus': 5, '25g:rock_sugar': 3 }),
      slotTotals({ '45g:osmanthus': 2, '25g:rock_sugar': 1 }),
      '2026-09-04',
      slotTotals({ '45g:osmanthus': 8, '25g:rock_sugar': 4 }),
      slotTotals({}),
    );
    expect(schedule.rows).toHaveLength(8);
    const g45 = schedule.rows.find((r) => r.slotId === '45g:osmanthus');
    const g25 = schedule.rows.find((r) => r.slotId === '25g:rock_sugar');
    expect(g45).toMatchObject({ demand: 5, stock: 2, shortfall: 6, sessions: null });
    expect(g25).toMatchObject({ demand: 3, stock: 1, shortfall: 3, sessions: null });
    expect(schedule.rows.find((r) => r.slotId === '25g:red_date')).toBeUndefined();
  });

  it('uses flavor-specific session bottle limits for 75g only', () => {
    expect(SESSION_BOTTLES_PER_FLAVOR.red_date).toBe(100);
    expect(SESSION_BOTTLES_PER_FLAVOR.osmanthus).toBe(110);
    expect(SESSION_BOTTLES_PER_FLAVOR.rock_sugar).toBe(110);
  });
});

describe('giftBoxSupplyByScheduleSlot', () => {
  it('aggregates on-hand gift boxes by slot', () => {
    const supply = giftBoxSupplyByScheduleSlot(
      [{ boxType: 'star_gold', quantity: 2 }],
      GIFT_BOX_BOMS,
    );
    expect(supply['75g:osmanthus']).toBe(6);
  });

  it('aggregates 45g trial set supply', () => {
    const supply = giftBoxSupplyByScheduleSlot(
      [{ boxType: 'trial_set', quantity: 1 }],
      GIFT_BOX_BOMS,
    );
    expect(supply['45g:red_date']).toBe(1);
    expect(supply['45g:osmanthus']).toBe(1);
    expect(supply['45g:rock_sugar']).toBe(1);
  });
});

describe('giftBoxSupplyByScheduleFlavor (deprecated)', () => {
  it('aggregates on-hand gift boxes by 75g flavor only', () => {
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
  it('reads finished inventory quantities per schedule slot', () => {
    const stock = stockFromFinishedRows([
      { sku: finishedSku('75g', 'rock_sugar'), quantity: 40 },
      { sku: finishedSku('75g_big_belly', 'rock_sugar'), quantity: 99 },
      { sku: finishedSku('45g', 'osmanthus'), quantity: 12 },
      { sku: finishedSku('25g', 'rock_sugar'), quantity: 7 },
    ]);
    expect(stock['75g:rock_sugar']).toBe(40);
    expect(stock['75g:red_date']).toBe(0);
    expect(stock['45g:osmanthus']).toBe(12);
    expect(stock['25g:rock_sugar']).toBe(7);
    expect(stock['25g:osmanthus']).toBe(0);
  });
});
