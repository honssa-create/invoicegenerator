import { describe, expect, it } from 'vitest';
import { getNestieeLines, parseNestieeLinesFromWoo } from './orders';

describe('parseNestieeLinesFromWoo', () => {
  it('maps Woo line_items name/qty/price/total', () => {
    const lines = parseNestieeLinesFromWoo([
      { name: '星空金', quantity: 2, price: 344, total: '688.00' },
      { name: '粉紅心意 - 桂花味', quantity: '1', price: '128.5', total: '128.50' },
    ]);
    expect(lines).toEqual([
      { name: '星空金', quantity: 2, unit_price: 344, line_total: 688 },
      { name: '粉紅心意 - 桂花味', quantity: 1, unit_price: 128.5, line_total: 128.5 },
    ]);
  });

  it('falls back to unit_price * quantity when total missing', () => {
    expect(parseNestieeLinesFromWoo([{ name: '紅色銀', quantity: 3, price: 10 }])).toEqual([
      { name: '紅色銀', quantity: 3, unit_price: 10, line_total: 30 },
    ]);
  });

  it('skips blank names', () => {
    expect(parseNestieeLinesFromWoo([{ name: '  ', quantity: 1, price: 5 }, { name: 'A', quantity: 1, price: 1 }])).toEqual([
      { name: 'A', quantity: 1, unit_price: 1, line_total: 1 },
    ]);
  });
});

describe('getNestieeLines', () => {
  it('parses JSON string from fields', () => {
    const lines = getNestieeLines({
      nestiee_lines: JSON.stringify([
        { name: '星空銀', quantity: 1, unit_price: 99, line_total: 99 },
      ]),
    });
    expect(lines).toEqual([{ name: '星空銀', quantity: 1, unit_price: 99, line_total: 99 }]);
  });

  it('returns empty on invalid JSON', () => {
    expect(getNestieeLines({ nestiee_lines: '{broken' })).toEqual([]);
  });
});
