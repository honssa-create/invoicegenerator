import { describe, expect, it } from 'vitest';
import {
  aggregateRawNeedsFromPrepOrders,
  computePrepCalculationForOrder,
  defaultCompletionSplits,
  formatPrepOrderScheduleLines,
  planPrepBatchOrderCode,
  planPrepCapacityLines,
  sessionPotBuckets,
  summarizePrepCapacityLines,
  summarizePrepSessions,
  STEW_POT_LIMIT_LARGE,
  STEW_POT_LIMIT_MIXED_75_45,
  STEW_POT_LIMIT_SMALL,
} from './kitchen-prep';

describe('planPrepBatchOrderCode', () => {
  it('keeps one order code for a multi-capacity batch and does not suffix capacity', () => {
    const code = planPrepBatchOrderCode('#12345', 'PREP-0009');
    const planned = planPrepCapacityLines([
      { capacity: '45g', qty_osmanthus: 40 },
      { capacity: '75g', qty_rock_sugar: 10 },
      { capacity: '25g', qty_rock_sugar: 25 },
    ]);
    expect(code).toBe('#12345');
    expect(code.endsWith('-45g')).toBe(false);
    expect(code.endsWith('-75g')).toBe(false);
    expect(code.includes('-25g')).toBe(false);
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.plan.lines).toHaveLength(3);
    expect(planned.plan.linesJson).toEqual(expect.any(String));
    expect(JSON.parse(planned.plan.linesJson || '[]')).toHaveLength(3);
    // Parent columns mirror the first line only, so a single-capacity formula is not applied to the other lines.
    expect(planned.plan.parent.capacity).toBe('45g');
    expect(planned.plan.parent.qty_osmanthus).toBe(40);
    expect(planned.plan.parent.qty_rock_sugar).toBe(0);
  });

  it('stores a single capacity on the parent columns with no lines JSON', () => {
    const code = planPrepBatchOrderCode('', 'PREP-0004');
    const planned = planPrepCapacityLines([{ capacity: '45g', qty_osmanthus: 8, qty_rock_sugar: 2 }]);
    expect(code).toBe('PREP-0004');
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.plan.linesJson).toBeNull();
    expect(planned.plan.lines).toHaveLength(1);
    expect(planned.plan.parent.qty_osmanthus).toBe(8);
    expect(planned.plan.parent.qty_rock_sugar).toBe(2);
  });

  it('merges duplicate capacities into one line', () => {
    const planned = planPrepCapacityLines([
      { capacity: '45g', qty_osmanthus: 10 },
      { capacity: '45g', qty_osmanthus: 5, qty_rock_sugar: 3 },
    ]);
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.plan.lines).toHaveLength(1);
    expect(planned.plan.lines[0]).toMatchObject({
      capacity: '45g',
      qty_osmanthus: 15,
      qty_rock_sugar: 3,
    });
    expect(planned.plan.linesJson).toBeNull();
  });
});

describe('schedule lines and capacity summary', () => {
  const order = {
    order_code: '#12104',
    capacity: '45g',
    qty_osmanthus: 40,
    qty_red_date: 0,
    qty_rock_sugar: 0,
    lines: [
      { capacity: '45g', qty_osmanthus: 40, qty_red_date: 0, qty_rock_sugar: 25 },
      { capacity: '25g', qty_osmanthus: 0, qty_red_date: 0, qty_rock_sugar: 25 },
    ],
  };

  it('lists flavors under one order number', () => {
    expect(formatPrepOrderScheduleLines(order)).toEqual([
      '#12104 - 桂花 x40 (45g)',
      '#12104 - 冰糖 x25 (45g)',
      '#12104 - 冰糖 x25 (25g)',
    ]);
  });

  it('groups summary by capacity and joins flavors with ｜', () => {
    expect(summarizePrepCapacityLines(order.lines).map((line) => `${line.label}: ${line.text}`)).toEqual([
      '45g: 桂花 x40｜冰糖 x25',
      '25g: 冰糖 x25',
    ]);
    expect(summarizePrepCapacityLines(order.lines).map((line) => line.bottles)).toEqual([65, 25]);
  });
});

describe('session pot limits', () => {
  it('does not add different capacities into the same 150 or 100 bucket', () => {
    const buckets = sessionPotBuckets([
      { capacity: '25g', bottles: 100 },
      { capacity: '45g', bottles: 80 },
      { capacity: '75g', bottles: 70 },
    ]);
    const byId = Object.fromEntries(buckets.map((bucket) => [bucket.id, bucket]));
    expect(byId['25g']).toMatchObject({ bottles: 100, limit: STEW_POT_LIMIT_SMALL, mixed: false });
    expect(byId['45g']).toMatchObject({ bottles: 80, limit: STEW_POT_LIMIT_SMALL, mixed: false });
    expect(byId['75g']).toMatchObject({ bottles: 70, limit: STEW_POT_LIMIT_LARGE, mixed: false });
    expect(buckets.some((bucket) => !bucket.mixed && bucket.bottles === 180)).toBe(false);
    expect(buckets.some((bucket) => !bucket.mixed && bucket.bottles === 150)).toBe(false);
    expect(byId['mixed-75g-45g']).toMatchObject({
      bottles: 150,
      limit: STEW_POT_LIMIT_MIXED_75_45,
      mixed: true,
    });
    expect(byId['mixed-75g-45g'].bottles).toBe(80 + 70);
  });

  it('leaves 25g out of the 75g+45g mixed pot', () => {
    const buckets = sessionPotBuckets([
      { capacity: '75g', bottles: 40 },
      { capacity: '25g', bottles: 90 },
    ]);
    expect(buckets.map((bucket) => bucket.id).sort()).toEqual(['25g', '75g']);
  });

  it('uses 120 for a 75g + 45g mix and keeps each capacity on its own limit', () => {
    const buckets = sessionPotBuckets([
      { capacity: '75g', bottles: 80 },
      { capacity: '45g', bottles: 50 },
    ]);
    expect(buckets.find((bucket) => bucket.id === '75g')).toMatchObject({ bottles: 80, limit: 100 });
    expect(buckets.find((bucket) => bucket.id === '45g')).toMatchObject({ bottles: 50, limit: 150 });
    expect(buckets.find((bucket) => bucket.mixed)).toMatchObject({ bottles: 130, limit: 120 });
  });

  it('keeps each stewing date as its own session total', () => {
    const sessions = summarizePrepSessions([
      {
        stewing_date: '2026-10-23',
        capacity: '45g',
        qty_osmanthus: 10,
        qty_red_date: 0,
        qty_rock_sugar: 0,
      },
      {
        stewing_date: '2026-10-24',
        capacity: '45g',
        qty_osmanthus: 20,
        qty_red_date: 0,
        qty_rock_sugar: 0,
      },
    ]);
    expect(sessions.map((session) => session.sessionKey)).toEqual(['2026-10-23', '2026-10-24']);
    expect(sessions[0].lines[0].bottles).toBe(10);
    expect(sessions[1].lines[0].bottles).toBe(20);
    expect(sessions[0].potBuckets[0].bottles).toBe(10);
  });
});

describe('multi-capacity calculations', () => {
  it('applies each capacity formula on its own and sums raw needs', () => {
    const order = {
      capacity: '45g',
      order_type: 'daily' as const,
      qty_osmanthus: 40,
      qty_red_date: 0,
      qty_rock_sugar: 0,
      lines: [
        { capacity: '45g', qty_osmanthus: 40, qty_red_date: 0, qty_rock_sugar: 0 },
        { capacity: '25g', qty_osmanthus: 0, qty_red_date: 0, qty_rock_sugar: 25 },
      ],
    };
    const calc = computePrepCalculationForOrder(order);
    expect(calc.totals.bottles).toBe(65);
    expect(calc.totals.ingredientGrams['片糖']).toBeCloseTo(40 * 5.03, 5);
    expect(calc.totals.ingredientGrams['冰糖']).toBeCloseTo(25 * 1.98, 5);
    expect(calc.totals.ingredientGrams['45g玻璃燉瓶']).toBe(40);
    expect(calc.totals.ingredientGrams['25g玻璃燉瓶']).toBe(25);
    expect(calc.capacities).toEqual(['45g', '25g']);

    const splits = defaultCompletionSplits(calc, '45g').filter((split) => split.qty > 0);
    expect(splits.map((split) => `${split.capacity}:${split.flavor}:${split.qty}`)).toEqual([
      '45g:osmanthus:40',
      '25g:rock_sugar:25',
    ]);
  });

  it('still calculates a legacy single-capacity row from the parent columns', () => {
    const calc = computePrepCalculationForOrder({
      capacity: '25g',
      order_type: 'daily',
      qty_osmanthus: 0,
      qty_red_date: 0,
      qty_rock_sugar: 10,
    });
    expect(calc.capacities).toBeUndefined();
    expect(calc.totals.bottles).toBe(10);
    expect(calc.totals.ingredientGrams['25g玻璃燉瓶']).toBe(10);
    expect(calc.totals.ingredientGrams['冰糖']).toBeCloseTo(10 * 1.98, 5);
  });

  it('includes every capacity line when aggregating unfinished prep demand', () => {
    const raw = aggregateRawNeedsFromPrepOrders([
      {
        capacity: '45g',
        order_type: 'daily',
        status: 'scheduled',
        qty_osmanthus: 40,
        qty_red_date: 0,
        qty_rock_sugar: 0,
        lines_json: JSON.stringify([
          { capacity: '45g', qty_osmanthus: 40, qty_red_date: 0, qty_rock_sugar: 0 },
          { capacity: '25g', qty_osmanthus: 0, qty_red_date: 0, qty_rock_sugar: 10 },
        ]),
      },
    ]);
    expect(raw['45g玻璃燉瓶']).toBe(40);
    expect(raw['25g玻璃燉瓶']).toBe(10);
    expect(raw['片糖']).toBeCloseTo(40 * 5.03, 5);
    expect(raw['冰糖']).toBeCloseTo(10 * 1.98, 5);
  });
});
