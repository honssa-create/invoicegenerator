import { describe, expect, it } from 'vitest';
import {
  aggregateRawNeedsFromPrepOrders,
  computePrepOrderRawNeeds,
} from './kitchen-prep';

describe('computePrepOrderRawNeeds', () => {
  it('uses stored actual production qty when provided', () => {
    const lines = computePrepOrderRawNeeds(
      '25g',
      'wedding',
      { osmanthus: 0, red_date: 0, rock_sugar: 10 },
      undefined,
      { rock_sugar: 13 }
    );
    const map = Object.fromEntries(lines.map((l) => [l.name, l.qty]));
    expect(map['燕餅']).toBeCloseTo(13 * 0.4, 5);
    expect(map['冰糖']).toBeCloseTo(13 * 1.98, 5);
  });

  it('does not auto-add a wedding +3 buffer', () => {
    const lines = computePrepOrderRawNeeds('25g', 'wedding', {
      osmanthus: 0,
      red_date: 0,
      rock_sugar: 10,
    });
    const map = Object.fromEntries(lines.map((l) => [l.name, l.qty]));
    expect(map['燕餅']).toBeCloseTo(10 * 0.4, 5);
    expect(map['冰糖']).toBeCloseTo(10 * 1.98, 5);
  });
});

describe('aggregateRawNeedsFromPrepOrders', () => {
  it('sums unfinished prep orders and skips completed', () => {
    const raw = aggregateRawNeedsFromPrepOrders([
      {
        capacity: '25g',
        order_type: 'daily',
        status: 'in_prep',
        qty_osmanthus: 10,
        qty_red_date: 0,
        qty_rock_sugar: 0,
      },
      {
        capacity: '25g',
        order_type: 'daily',
        status: 'completed',
        qty_osmanthus: 100,
        qty_red_date: 0,
        qty_rock_sugar: 0,
      },
      {
        capacity: '25g',
        order_type: 'daily',
        status: 'scheduled',
        qty_osmanthus: 0,
        qty_red_date: 0,
        qty_rock_sugar: 5,
      },
    ]);
    // 10 osmanthus: 燕餅 4, 桂花 0.72, 片糖 27.9
    // 5 rock_sugar: 燕餅 2, 冰糖 9.9
    expect(raw['燕餅']).toBeCloseTo(4 + 2, 5);
    expect(raw['桂花']).toBeCloseTo(10 * 0.072, 5);
    expect(raw['片糖']).toBeCloseTo(10 * 2.79, 5);
    expect(raw['冰糖']).toBeCloseTo(5 * 1.98, 5);
  });
});
