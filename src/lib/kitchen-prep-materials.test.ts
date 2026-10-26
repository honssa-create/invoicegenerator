import { describe, expect, it } from 'vitest';
import {
  buildPrepMaterialsTable,
  CAPACITY_FLAVOR_FORMULAS,
  formatPrepMaterialAmount,
  formulaFromLines,
  prepCustomerOrderKey,
  resolvePrepBatch,
  STEW_WATER_BOIL_SUGAR,
  STEW_WATER_COLD_SOAK,
  type PrepBatchSibling,
  type PrepCapacityLine,
} from './kitchen-prep';

function sibling(partial: Partial<PrepBatchSibling> & Pick<PrepBatchSibling, 'id' | 'order_code'>): PrepBatchSibling {
  return {
    stewing_date: '2026-10-23',
    status: 'scheduled',
    capacity: '45g',
    qty_osmanthus: 0,
    qty_red_date: 0,
    qty_rock_sugar: 0,
    ...partial,
  };
}

function line(partial: Partial<PrepCapacityLine> & Pick<PrepCapacityLine, 'capacity'>): PrepCapacityLine {
  return {
    qty_osmanthus: 0,
    qty_red_date: 0,
    qty_rock_sugar: 0,
    ...partial,
  };
}

describe('prep materials table', () => {
  it('strips capacity and batch suffixes back to the customer order', () => {
    expect(prepCustomerOrderKey('#12105-45g')).toBe('#12105');
    expect(prepCustomerOrderKey('#12105-02單')).toBe('#12105');
    expect(prepCustomerOrderKey('PREP-0001')).toBe('PREP-0001');
  });

  it('uses 今次 order qty for grams and shows 0 prior when there is no earlier batch', () => {
    const order = sibling({
      id: 3,
      order_code: '#12105',
      lines: [
        line({ capacity: '45g', qty_osmanthus: 40, actual_qty_osmanthus: 55 }),
        line({ capacity: '25g', qty_rock_sugar: 25, actual_qty_rock_sugar: 30 }),
      ],
    });
    const batch = resolvePrepBatch(order.id, [order]);
    expect(batch.label).toBeNull();
    expect(batch.priorLines).toEqual([]);

    const table = buildPrepMaterialsTable(order, batch.priorLines, { batchLabel: batch.label });
    expect(table.batchLabel).toBeNull();
    expect(table.boxes.map((box) => box.title)).toEqual(['45g · 桂花', '25g · 冰糖']);
    const osmanthus = table.boxes[0].rows[0];
    expect(osmanthus.prior).toBe(0);
    expect(osmanthus.now).toBe(40);
    expect(osmanthus.materials.bottles).toBe(40);
    expect(osmanthus.materials.birdNest).toBe(32);
    expect(osmanthus.materials.osmanthus).toBe(5.2);
    expect(osmanthus.materials.slabSugar).toBe(201.2);
    expect(osmanthus.materials.rockSugar).toBe(0);
    expect(osmanthus.materials.boilSugarWater).toBe(0);
    expect(osmanthus.materials.coldSoakWater).toBe(0);
    const rock = table.boxes[1].rows[0];
    expect(rock.now).toBe(25);
    expect(rock.materials.birdNest).toBe(10);
    expect(rock.materials.rockSugar).toBe(49.5);
    expect(rock.materials.bottles).toBe(25);
    expect(rock.materials.boilSugarWater).toBe(0);
    expect(rock.materials.coldSoakWater).toBe(0);
    expect(table.now).toBe(65);
    expect(table.prior).toBe(0);
    expect(table.materials.birdNest).toBe(42);
    expect(table.materials.bottles).toBe(65);
    expect(table.materials.boilSugarWater).toBe(0);
    expect(table.materials.coldSoakWater).toBe(0);
  });

  it('sums 水(煮糖) and 水(冷泡) from formula lines into row, box, and footer totals', () => {
    const formulas = structuredClone(CAPACITY_FLAVOR_FORMULAS);
    formulas['45g']!.osmanthus = formulaFromLines([
      { name: '燕餅', qty: 0.8 },
      { name: '桂花', qty: 0.13 },
      { name: '片糖', qty: 5.03 },
      { name: STEW_WATER_BOIL_SUGAR, qty: 12 },
      { name: STEW_WATER_COLD_SOAK, qty: 8.125 },
    ]);
    formulas['25g']!.rock_sugar = formulaFromLines([
      { name: '燕餅', qty: 0.4 },
      { name: '冰糖', qty: 1.98 },
      { name: STEW_WATER_BOIL_SUGAR, qty: 20 },
    ]);

    const order = sibling({
      id: 1,
      order_code: '#12105',
      lines: [
        line({ capacity: '45g', qty_osmanthus: 10, actual_qty_osmanthus: 99 }),
        line({ capacity: '25g', qty_rock_sugar: 4 }),
      ],
    });
    const table = buildPrepMaterialsTable(order, [], { formulas });

    const osmanthus = table.boxes[0].rows[0];
    expect(osmanthus.now).toBe(10);
    expect(osmanthus.materials.birdNest).toBe(8);
    expect(osmanthus.materials.boilSugarWater).toBe(120);
    expect(osmanthus.materials.coldSoakWater).toBe(81.25);
    expect(table.boxes[0].materials.boilSugarWater).toBe(120);
    expect(table.boxes[0].materials.coldSoakWater).toBe(81.25);

    const rock = table.boxes[1].rows[0];
    expect(rock.materials.boilSugarWater).toBe(80);
    expect(rock.materials.coldSoakWater).toBe(0);
    expect(formatPrepMaterialAmount(rock.materials.coldSoakWater)).toBe('—');
    expect(formatPrepMaterialAmount(0)).toBe('—');

    expect(table.materials.boilSugarWater).toBe(200);
    expect(table.materials.coldSoakWater).toBe(81.25);
    expect(table.materials.bottles).toBe(14);
  });

  it('labels a later batch -02單 and keeps prior stewed qty with 今次 materials only', () => {
    const prior = sibling({
      id: 1,
      order_code: '#12105',
      stewing_date: '2026-10-22',
      status: 'completed',
      lines: [line({ capacity: '45g', qty_osmanthus: 40 })],
      completion_splits: [{ label: '桂花 45g', qty: 40, flavor: 'osmanthus', capacity: '45g' }],
    });
    const current = sibling({
      id: 3,
      order_code: '#12105',
      stewing_date: '2026-10-23',
      status: 'scheduled',
      lines: [line({ capacity: '25g', qty_rock_sugar: 25 })],
    });
    const batch = resolvePrepBatch(current.id, [prior, current]);
    expect(batch.label).toBe('#12105-02單');
    expect(batch.count).toBe(2);

    const table = buildPrepMaterialsTable(current, batch.priorLines, { batchLabel: batch.label });
    expect(table.batchLabel).toBe('#12105-02單');
    expect(table.boxes.map((box) => box.capacity)).toEqual(['45g', '25g']);
    const g45 = table.boxes[0];
    const g25 = table.boxes[1];
    expect(g45.headerAside).toBe('今次要燉 0 · 上單已燉 40');
    expect(g45.rows[0]).toMatchObject({ label: '桂花', prior: 40, now: 0 });
    expect(g45.rows[0].materials).toEqual({
      birdNest: 0,
      osmanthus: 0,
      rockSugar: 0,
      slabSugar: 0,
      boilSugarWater: 0,
      coldSoakWater: 0,
      bottles: 0,
    });
    expect(g25.headerAside).toBe('今次要燉 25');
    expect(g25.rows[0]).toMatchObject({ label: '冰糖', prior: 0, now: 25 });
    expect(g25.rows[0].materials.birdNest).toBe(10);
    expect(g25.rows[0].materials.rockSugar).toBe(49.5);
    expect(g25.rows[0].materials.bottles).toBe(25);
    expect(table.prior).toBe(40);
    expect(table.now).toBe(25);
    expect(table.materials).toMatchObject({
      birdNest: 10,
      osmanthus: 0,
      rockSugar: 49.5,
      slabSugar: 0,
      boilSugarWater: 0,
      coldSoakWater: 0,
      bottles: 25,
    });
  });

  it('does not treat an earlier unfinished batch as already stewed', () => {
    const earlier = sibling({
      id: 1,
      order_code: '#12105-45g',
      stewing_date: '2026-10-22',
      status: 'stewing',
      lines: [line({ capacity: '45g', qty_osmanthus: 40 })],
    });
    const current = sibling({
      id: 2,
      order_code: '#12105-25g',
      stewing_date: '2026-10-23',
      lines: [line({ capacity: '25g', qty_rock_sugar: 25 })],
    });
    const batch = resolvePrepBatch(current.id, [earlier, current]);
    expect(batch.label).toBe('#12105-02單');
    expect(batch.priorLines).toEqual([]);
    const table = buildPrepMaterialsTable(current, batch.priorLines, { batchLabel: batch.label });
    expect(table.boxes.map((box) => box.capacity)).toEqual(['25g']);
    expect(table.prior).toBe(0);
    expect(table.now).toBe(25);
  });
});
