import { describe, expect, it } from 'vitest';
import type { Order } from './orders';
import {
  clampTextOffset,
  DEFAULT_TEXT_OFFSET,
  fieldStr,
  prefillProductionNote,
  productionNoteTextLines,
  type ProductionNoteFields,
} from './production-note';

function baseOrder(over: Partial<Order> = {}): Order {
  return {
    id: 42,
    user_id: 1,
    po_number: 'H3326',
    name: '',
    description: '',
    status: 'open',
    shipping_address: '',
    phone: '',
    email: '',
    carton_count: '',
    notes: '',
    total_amount: null,
    fields: {},
    files: [],
    activities: [],
    linked_invoice: null,
    linked_quotation: null,
    created_at: '',
    updated_at: '',
    ...over,
  } as Order;
}

describe('fieldStr', () => {
  it('trims string fields and maps booleans', () => {
    expect(fieldStr({ a: '  x  ' }, 'a')).toBe('x');
    expect(fieldStr({ b: true }, 'b')).toBe('yes');
    expect(fieldStr({ c: false }, 'c')).toBe('');
    expect(fieldStr({}, 'missing')).toBe('');
  });
});

describe('prefillProductionNote', () => {
  it('prefills PO with #, craft/clasp details, qty, price, ship date', () => {
    const order = baseOrder({
      po_number: 'H3326',
      fields: {
        craft: '52.5MM',
        clasp: '四節圓扣',
        plating_color: '雙層雙面',
        honour_lines: JSON.stringify([{ style: 'Gameboy', quantity: '103', unit_price: '10' }]),
        supplier_price: 'RMB 3.2',
        supplier_ship_date: '7月13日寄出',
      },
    });
    expect(prefillProductionNote(order)).toEqual({
      po: '#H3326',
      details: '52.5MM, 雙層雙面, 四節圓扣',
      quantity: '103',
      price: 'RMB 3.2',
      shipDate: '7月13日寄出',
    });
  });

  it('falls back to order id when PO empty', () => {
    const order = baseOrder({ po_number: '', id: 7, fields: {} });
    expect(prefillProductionNote(order).po).toBe('#7');
  });

  it('prefills craft details from per-line honour fields when flats empty', () => {
    const order = baseOrder({
      po_number: 'H9',
      fields: {
        honour_lines: JSON.stringify([
          {
            style: 'Badge',
            quantity: '10',
            unit_price: '1',
            craft: 'line craft',
            plating_color: '金',
            clasp: '磁扣',
          },
        ]),
      },
    });
    expect(prefillProductionNote(order).details).toBe('line craft, 金, 磁扣');
  });
});

describe('productionNoteTextLines', () => {
  it('formats quantity and price labels; omits empty lines', () => {
    const fields: ProductionNoteFields = {
      po: 'H3326',
      details: '52.5MM, 雙層雙面',
      quantity: '103',
      price: 'RMB 3.2',
      shipDate: '7月13日寄出',
    };
    expect(productionNoteTextLines(fields)).toEqual([
      '#H3326',
      '52.5MM, 雙層雙面',
      '數量 : 103個',
      '價錢 : RMB 3.2',
      '7月13日寄出',
    ]);
  });

  it('does not append 個 when already present', () => {
    expect(
      productionNoteTextLines({
        po: '',
        details: '',
        quantity: '10個',
        price: '',
        shipDate: '',
      })
    ).toEqual(['數量 : 10個']);
  });
});

describe('clampTextOffset', () => {
  it('keeps default inside bounds', () => {
    expect(clampTextOffset(DEFAULT_TEXT_OFFSET)).toEqual(DEFAULT_TEXT_OFFSET);
  });

  it('clamps negative and oversized values', () => {
    expect(clampTextOffset({ x: -1, y: -0.5 })).toEqual({ x: 0, y: 0 });
    const clamped = clampTextOffset({ x: 2, y: 2 });
    expect(clamped.x).toBeLessThanOrEqual(1);
    expect(clamped.y).toBeLessThanOrEqual(1);
  });
});
