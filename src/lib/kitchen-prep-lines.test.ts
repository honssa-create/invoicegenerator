import { describe, expect, it } from 'vitest';
import {
  aggregateRawNeedsFromPrepOrders,
  buildDaySugarWaterSheet,
  PREP_DAY_OSMANTHUS_SPARE_FACTOR,
  CAPACITY_FLAVOR_FORMULAS,
  computePrepCalculationForOrder,
  dayMaterialsCapacityLabel,
  defaultCompletionSplits,
  formatDayMaterialAmount,
  formatDayMaterialGrams,
  formatDayMaterialsOrderDetail,
  formatPrepDayHeading,
  formatPrepDayOrderTypes,
  formatPrepDaySlotCoverage,
  formatPrepOrderScheduleLines,
  formulaFromLines,
  getFormulaLines,
  groupPrepDaysForBoard,
  groupPrepOrdersForBoard,
  planPrepBatchOrderCode,
  planPrepCapacityLines,
  prepDayCardTitle,
  prepDayMaterialsPrintPath,
  prepGroupPrintPath,
  prepSessionCardTitle,
  prepSessionWorkflow,
  prepWeekdayLabel,
  summarizeDayMaterials,
  sessionPotBuckets,
  sortPrepOrdersForBoard,
  summarizePrepCapacityLines,
  summarizePrepSessions,
  STEW_WATER_BOIL_SUGAR,
  STEW_WATER_COLD_SOAK,
  STEW_POT_LIMIT_LARGE,
  STEW_POT_LIMIT_MIXED_75_45,
  STEW_POT_LIMIT_SMALL,
  type PrepFlavor,
  type StewFormulaMapLike,
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
    expect(sessions.map((session) => session.sessionKey)).toEqual([
      '2026-10-23|unset',
      '2026-10-24|unset',
    ]);
    expect(sessions[0].scheduleSlot).toBeNull();
    expect(sessions[0].lines[0].bottles).toBe(10);
    expect(sessions[1].lines[0].bottles).toBe(20);
    expect(sessions[0].potBuckets[0].bottles).toBe(10);
  });

  it('keeps AM and PM pots separate and leaves unset orders out of both', () => {
    const orders = [
      {
        id: 2,
        stewing_date: '2026-10-27',
        schedule_slot: 'PM' as const,
        order_code: 'B',
        status: 'scheduled',
        capacity: '45g',
        qty_osmanthus: 100,
        qty_red_date: 0,
        qty_rock_sugar: 0,
      },
      {
        id: 1,
        stewing_date: '2026-10-27',
        schedule_slot: 'AM' as const,
        order_code: 'A',
        status: 'scheduled',
        capacity: '45g',
        qty_osmanthus: 80,
        qty_red_date: 0,
        qty_rock_sugar: 0,
      },
      {
        id: 3,
        stewing_date: '2026-10-27',
        schedule_slot: null,
        order_code: 'C',
        status: 'scheduled',
        capacity: '75g',
        qty_osmanthus: 90,
        qty_red_date: 0,
        qty_rock_sugar: 0,
      },
    ];
    const sessions = summarizePrepSessions(orders);
    expect(sessions.map((session) => session.sessionKey)).toEqual([
      '2026-10-27|PM',
      '2026-10-27|AM',
      '2026-10-27|unset',
    ]);
    expect(sessions.map((session) => session.lines[0].bottles)).toEqual([100, 80, 90]);
    expect(sessions[0].potBuckets.find((bucket) => bucket.id === '45g')).toMatchObject({
      bottles: 100,
      limit: STEW_POT_LIMIT_SMALL,
    });
    expect(sessions[0].potBuckets.some((bucket) => bucket.bottles === 180)).toBe(false);

    const sorted = sortPrepOrdersForBoard(orders, 'stewing_date', 'asc');
    expect(sorted.map((order) => order.schedule_slot)).toEqual(['AM', 'PM', null]);
    const desc = sortPrepOrdersForBoard(
      [
        ...orders,
        {
          id: 4,
          stewing_date: '2026-10-28',
          schedule_slot: 'PM' as const,
          order_code: 'D',
          status: 'scheduled',
          capacity: '45g',
        },
      ],
      'stewing_date',
      'desc',
    );
    expect(desc.map((order) => `${order.stewing_date}|${order.schedule_slot ?? 'unset'}`)).toEqual([
      '2026-10-28|PM',
      '2026-10-27|AM',
      '2026-10-27|PM',
      '2026-10-27|unset',
    ]);

    const groups = groupPrepOrdersForBoard(sorted);
    expect(groups.map((group) => group.sessionKey)).toEqual([
      '2026-10-27|AM',
      '2026-10-27|PM',
      '2026-10-27|unset',
    ]);
    expect(groups[0].orders.map((order) => order.id)).toEqual([1]);
    expect(prepGroupPrintPath(groups[0].orders.map((order) => order.id))).toBe('/kitchen-prep/print?ids=1');
    expect(prepGroupPrintPath([2, 1, 0, 1.5])).toBe('/kitchen-prep/print?ids=2,1');

    const days = groupPrepDaysForBoard(sorted);
    expect(days).toHaveLength(1);
    expect(days[0].stewingDate).toBe('2026-10-27');
    expect(days[0].sessions.map((session) => session.sessionKey)).toEqual([
      '2026-10-27|AM',
      '2026-10-27|PM',
      '2026-10-27|unset',
    ]);
    expect(prepDayMaterialsPrintPath('2026-10-27')).toBe('/kitchen-prep/day-print?date=2026-10-27');
    expect(prepWeekdayLabel('2026-10-27')).toBe('星期二');
    expect(prepDayCardTitle('2026-10-27')).toBe('2026-10-27 星期二 · 全日');
    expect(prepSessionCardTitle('2026-10-27', 'AM')).toBe('2026-10-27 星期二 · 上午批次');
    expect(prepSessionCardTitle('2026-10-27', 'PM')).toBe('2026-10-27 星期二 · 下午批次');
    expect(prepSessionCardTitle('2026-10-27', null)).toBe('2026-10-27 星期二 · 未設定');
  });
});

function formulasWithWater(
  patches: Array<{ capacity: string; flavor: PrepFlavor; boil: number; cold?: number }>,
): StewFormulaMapLike {
  const formulas = structuredClone(CAPACITY_FLAVOR_FORMULAS) as StewFormulaMapLike;
  for (const patch of patches) {
    const cell = formulas[patch.capacity]?.[patch.flavor];
    if (!cell) throw new Error(`missing formula ${patch.capacity} ${patch.flavor}`);
    const lines = getFormulaLines(cell, patch.flavor).map((line) => {
      if (line.name === STEW_WATER_BOIL_SUGAR) return { ...line, qty: patch.boil };
      if (line.name === STEW_WATER_COLD_SOAK && patch.cold != null) return { ...line, qty: patch.cold };
      return line;
    });
    if (!lines.some((line) => line.name === STEW_WATER_BOIL_SUGAR)) {
      lines.push({ name: STEW_WATER_BOIL_SUGAR, qty: patch.boil });
    }
    if (patch.cold != null && !lines.some((line) => line.name === STEW_WATER_COLD_SOAK)) {
      lines.push({ name: STEW_WATER_COLD_SOAK, qty: patch.cold });
    }
    formulas[patch.capacity] = {
      ...formulas[patch.capacity],
      [patch.flavor]: formulaFromLines(lines),
    };
  }
  return formulas;
}

describe('day materials and session workflow', () => {
  it('sums 今次 grams across AM, PM, and unset and ignores actual extras', () => {
    const summary = summarizeDayMaterials([
      {
        id: 1,
        order_code: 'AM-A',
        order_type: 'daily',
        stewing_date: '2026-10-27',
        schedule_slot: 'AM',
        capacity: '45g',
        qty_osmanthus: 80,
        qty_red_date: 0,
        qty_rock_sugar: 0,
        actual_qty_osmanthus: 90,
      },
      {
        id: 2,
        order_code: 'PM-A',
        order_type: 'daily',
        stewing_date: '2026-10-27',
        schedule_slot: 'PM',
        capacity: '45g',
        qty_osmanthus: 100,
        qty_red_date: 0,
        qty_rock_sugar: 0,
      },
      {
        id: 3,
        order_code: 'UNSET',
        order_type: 'daily',
        stewing_date: '2026-10-27',
        schedule_slot: null,
        capacity: '45g',
        qty_osmanthus: 0,
        qty_red_date: 0,
        qty_rock_sugar: 12,
      },
    ]);
    const osmanthus = summary.lines.find((line) => line.flavor === 'osmanthus');
    const rock = summary.lines.find((line) => line.flavor === 'rock_sugar');
    expect(osmanthus?.bottles).toBe(180);
    expect(osmanthus?.slabSugar).toBeCloseTo(180 * 3.94, 5);
    expect(osmanthus?.boilSugar).toBeCloseTo(180 * 20.05, 5);
    expect(osmanthus?.coldSoak).toBeCloseTo(180 * 14.95, 5);
    expect(formatDayMaterialAmount(0)).toBe('—');
    expect(rock?.bottles).toBe(12);
    expect(summary.totals.bottles).toBe(192);
    expect(summary.totals.boilSugar).toBeCloseTo(180 * 20.05 + 12 * 35, 5);
    expect(summary.totals.coldSoak).toBeCloseTo(180 * 14.95, 5);
    expect(summary.slotBottles).toEqual({ AM: 80, PM: 100, unset: 12 });
    expect(summary.orders.map((order) => order.orderCode)).toEqual(['AM-A', 'PM-A', 'UNSET']);
    expect(summary.orders[0].detail).toBe('45g 桂80');
  });

  it('groups 桂花 alone and 紅棗＋冰糖 together, with water from the catalog formula', () => {
    const formulas = formulasWithWater([
      { capacity: '45g', flavor: 'osmanthus', boil: 12, cold: 8.125 },
      { capacity: '25g', flavor: 'osmanthus', boil: 12, cold: 8.124 },
      { capacity: '75g', flavor: 'osmanthus', boil: 12, cold: 8.13 },
      { capacity: '45g', flavor: 'red_date', boil: 12, cold: 9 },
      { capacity: '25g', flavor: 'rock_sugar', boil: 20 },
    ]);
    const summary = summarizeDayMaterials(
      [
        {
          id: 1,
          order_code: '#10986',
          order_type: 'wedding',
          stewing_date: '2026-10-27',
          schedule_slot: 'AM',
          capacity: '45g',
          qty_osmanthus: 60,
          qty_red_date: 60,
          qty_rock_sugar: 0,
        },
        {
          id: 2,
          order_code: '#12104-01',
          order_type: 'wedding',
          stewing_date: '2026-10-27',
          schedule_slot: 'PM',
          capacity: '45g',
          qty_osmanthus: 40,
          qty_red_date: 70,
          qty_rock_sugar: 0,
          lines: [
            { capacity: '45g', qty_osmanthus: 40, qty_red_date: 70, qty_rock_sugar: 0 },
            { capacity: '25g', qty_osmanthus: 25, qty_red_date: 0, qty_rock_sugar: 25 },
            { capacity: '75g', qty_osmanthus: 10, qty_red_date: 0, qty_rock_sugar: 0 },
          ],
        },
      ],
      formulas,
    );

    const os45 = summary.lines.find((line) => line.flavor === 'osmanthus' && line.capacity === '45g');
    expect(os45?.bottles).toBe(100);
    expect(os45?.osmanthus).toBeCloseTo(9.9, 5);
    expect(os45?.slabSugar).toBeCloseTo(394, 5);
    expect(os45?.boilSugar).toBeCloseTo(1200, 5);
    expect(os45?.coldSoak).toBeCloseTo(812.5, 5);
    const red = summary.lines.find((line) => line.flavor === 'red_date');
    expect(red?.coldSoak).toBeCloseTo(130 * 9, 5);
    expect(red?.boilSugar).toBeCloseTo(1560, 5);

    const sheet = buildDaySugarWaterSheet(summary);
    expect(sheet.groups.map((group) => group.id)).toEqual(['osmanthus', 'combo']);
    const osmanthus = sheet.groups[0];
    const combo = sheet.groups[1];
    expect(osmanthus.boxes.map((box) => box.key)).toEqual([
      'boilSugar',
      'coldSoak',
      'slabSugar',
      'osmanthus',
      'boilColdSoakTotal',
    ]);
    expect(osmanthus.boxes.map((box) => box.label)).toEqual([
      '水(煮糖)',
      '冷泡水',
      '片糖',
      '桂花乾',
      '合計（水煮糖＋冷泡水）',
    ]);
    expect(osmanthus.boxes[4].amount).toBeCloseTo(osmanthus.boxes[0].amount + osmanthus.boxes[1].amount, 5);

    const sheetSpare = buildDaySugarWaterSheet(summary, { osmanthusSpare: true });
    const osSpare = sheetSpare.groups[0];
    const factor = PREP_DAY_OSMANTHUS_SPARE_FACTOR;
    expect(osSpare.boxes[0].amount).toBeCloseTo(osmanthus.boxes[0].amount * factor, 5);
    expect(osSpare.boxes[1].amount).toBeCloseTo(osmanthus.boxes[1].amount * factor, 5);
    expect(osSpare.boxes[4].amount).toBeCloseTo(osSpare.boxes[0].amount + osSpare.boxes[1].amount, 5);
    expect(osSpare.boxes.map((box) => box.label)).toEqual([
      '水(煮糖) ×1.3',
      '冷泡水 ×1.3',
      '片糖 ×1.3',
      '桂花乾 ×1.3',
      '合計（水煮糖＋冷泡水） ×1.3',
    ]);
    expect(osSpare.boilSugar).toBeCloseTo(osmanthus.boilSugar, 5);
    expect(osSpare.rows[0]?.boilSugar).toBeCloseTo(osmanthus.rows[0]?.boilSugar ?? 0, 5);
    expect(sheetSpare.groups[1].boxes.map((box) => box.key)).toEqual([
      'rockSugar',
      'boilSugar',
      'comboSugarWaterTotal',
    ]);
    expect(sheetSpare.groups[1].boxes[2].amount).toBeCloseTo(combo.boilSugar, 5);
    expect(osmanthus.bottles).toBe(135);
    expect(osmanthus.boilSugar).toBeCloseTo(1200 + 300 + 120, 5);
    expect(osmanthus.coldSoak).toBeCloseTo(812.5 + 203.1 + 81.3, 5);
    expect(combo.boxes.map((box) => box.key)).toEqual(['rockSugar', 'boilSugar', 'comboSugarWaterTotal']);
    expect(combo.boxes.map((box) => box.label)).toEqual(['冰糖', '水(煮糖)', '糖水量合計']);
    expect(combo.boxes[0].amount).toBeCloseTo(combo.rockSugar, 5);
    expect(combo.boxes[1].amount).toBeCloseTo(combo.boilSugar, 5);
    expect(combo.boxes[2].amount).toBeCloseTo(combo.boilSugar, 5);
    expect(combo.boxes.some((box) => box.key === 'redDate')).toBe(false);
    expect(combo.boxes.some((box) => box.key === 'coldSoak')).toBe(false);
    expect(combo.coldSoak).toBe(0);
    expect(combo.bottleNote).toBe('紅130 + 冰25');
    expect(combo.rows.map((row) => `${row.flavor}:${row.capacity}`)).toEqual(['red_date:45g', 'rock_sugar:25g']);
    expect(combo.boilSugar).toBeCloseTo(1560 + 500, 5);
    expect(sheet.footer.osmanthusColdSoak).toBeCloseTo(osmanthus.coldSoak, 5);
    expect(sheet.footer.osmanthusColdSoak).not.toBeCloseTo(red?.coldSoak || 0, 0);
    expect(sheet.footer.boilSugar).toBeCloseTo(osmanthus.boilSugar + combo.boilSugar, 5);
    expect(sheet.footer.comboBoil).toBeCloseTo(combo.boilSugar, 5);
    expect(formatDayMaterialGrams(0)).toBe('—');
    expect(formatDayMaterialAmount(1620)).toBe('1,620');
    expect(formatDayMaterialAmount(1096.9)).toBe('1,096.9');
    expect(formatDayMaterialGrams(2060)).toBe('2,060 g');
    expect(formatPrepDayHeading('2026-10-27')).toBe('2026-10-27 星期二 · 全日');
    expect(formatPrepDaySlotCoverage(['AM', 'PM'])).toBe('AM + PM');
    expect(formatPrepDaySlotCoverage(['AM', null])).toBe('AM + 未設定');
    expect(formatPrepDayOrderTypes(['wedding', 'wedding'])).toBe('回禮訂單 Wedding');
    expect(formatPrepDayOrderTypes(['wedding', 'daily'])).toBe('回禮訂單 Wedding · 日常訂單 Daily');
    expect(dayMaterialsCapacityLabel('75g')).toBe('75g（高身）');
    expect(dayMaterialsCapacityLabel('75g_big_belly')).toBe('75g（大肚）');
    expect(summary.orders[1].detail).toBe('45g 桂40+紅70 · 25g 桂25+冰25 · 75g（高身） 桂10');
    expect(
      formatDayMaterialsOrderDetail({
        capacity: '45g',
        qty_osmanthus: 0,
        qty_red_date: 30,
        qty_rock_sugar: 0,
      }),
    ).toBe('45g 紅30');
  });

  it('shows start until every open order is stewing, then complete', () => {
    expect(prepSessionWorkflow(['scheduled', 'prepped'])).toBe('start');
    expect(prepSessionWorkflow(['stewing', 'scheduled'])).toBe('start');
    expect(prepSessionWorkflow(['stewing', 'completed'])).toBe('complete');
    expect(prepSessionWorkflow(['completed', 'completed'])).toBe('done');
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
    expect(calc.totals.ingredientGrams['片糖']).toBeCloseTo(157.6, 2);
    expect(calc.totals.ingredientGrams['冰糖']).toBeCloseTo(39.67, 2);
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
    expect(calc.totals.ingredientGrams['冰糖']).toBeCloseTo(15.87, 2);
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
    expect(raw['片糖']).toBeCloseTo(157.6, 2);
    expect(raw['冰糖']).toBeCloseTo(15.87, 2);
  });
});
