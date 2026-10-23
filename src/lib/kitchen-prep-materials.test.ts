import { describe, expect, it } from 'vitest';
import {
  buildPrepMaterialsTable,
  prepCustomerOrderKey,
  resolvePrepBatch,
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
    const rock = table.boxes[1].rows[0];
    expect(rock.now).toBe(25);
    expect(rock.materials.birdNest).toBe(10);
    expect(rock.materials.rockSugar).toBe(49.5);
    expect(rock.materials.bottles).toBe(25);
    expect(table.now).toBe(65);
    expect(table.prior).toBe(0);
    expect(table.materials.birdNest).toBe(42);
    expect(table.materials.bottles).toBe(65);
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
    expect(g45.rows[0].materials).toEqual({ birdNest: 0, osmanthus: 0, rockSugar: 0, slabSugar: 0, bottles: 0 });
    expect(g25.headerAside).toBe('今次要燉 25');
    expect(g25.rows[0]).toMatchObject({ label: '冰糖', prior: 0, now: 25 });
    expect(g25.rows[0].materials.birdNest).toBe(10);
    expect(g25.rows[0].materials.rockSugar).toBe(49.5);
    expect(g25.rows[0].materials.bottles).toBe(25);
    expect(table.prior).toBe(40);
    expect(table.now).toBe(25);
    expect(table.materials).toMatchObject({ birdNest: 10, osmanthus: 0, rockSugar: 49.5, slabSugar: 0, bottles: 25 });
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
