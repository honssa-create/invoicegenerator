import { describe, expect, it } from 'vitest';
import {
  buildQuotationItemsFromOrder,
  buildQuotationNotesFromOrder,
  parseNumericFromText,
  parseOrderDate,
  quotationValidUntilFromIssueDate,
  summarizeHonourCraftDescription,
} from './order-to-quotation';
import { emptyHonourLine } from './orders';

describe('parseNumericFromText', () => {
  it('extracts numbers from mixed text', () => {
    expect(parseNumericFromText('rmb 4.2')).toBe(4.2);
    expect(parseNumericFromText('4款各53個')).toBe(4);
    expect(parseNumericFromText('')).toBe(0);
  });
});

describe('parseOrderDate', () => {
  it('parses ISO and slash dates', () => {
    expect(parseOrderDate('2026-04-15')).toBe('2026-04-15');
    expect(parseOrderDate('28/1/26')).toBe('2026-01-28');
  });
});

describe('buildQuotationItemsFromOrder', () => {
  it('maps badge orders from legacy badge fields', () => {
    const items = buildQuotationItemsFromOrder({
      description: '4款亞加力',
      name: 'Jane',
      po_number: 'PO-1',
      fields: {
        order_type: 'honour訂製',
        badge_style: '亞加力雙面',
        badge_quantity: '100',
        supplier_price: 'rmb 12.5',
      },
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      product_service: '亞加力雙面',
      description: '',
      quantity: 100,
      unit_price: 12.5,
    });
  });

  it('maps honour_lines into multiple quotation items', () => {
    const items = buildQuotationItemsFromOrder({
      description: 'Custom badges',
      name: 'Jane',
      po_number: 'PO-2',
      fields: {
        order_type: 'honour en訂製',
        honour_lines: JSON.stringify([
          { style: 'Acrylic A', quantity: '50', unit_price: '8' },
          { style: 'Acrylic B', quantity: '20', unit_price: '12.5' },
        ]),
        supplier_price: '1',
      },
    });
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      product_service: 'Acrylic A',
      description: '',
      quantity: 50,
      unit_price: 8,
    });
    expect(items[1]).toMatchObject({
      product_service: 'Acrylic B',
      description: '',
      quantity: 20,
      unit_price: 12.5,
    });
  });

  it('fills description from filled craft fields only (one line each)', () => {
    const items = buildQuotationItemsFromOrder({
      description: 'Ignore me',
      name: '',
      po_number: '',
      fields: {
        order_type: 'honour訂製',
        honour_lines: JSON.stringify([
          {
            style: '金屬襟章',
            quantity: '100',
            unit_price: '5',
            card_size: '30 x 15mm',
            craft: '滴膠',
            plating_color: '',
            clasp: '蝴蝶扣',
          },
          {
            style: 'Shipping',
            quantity: '1',
            unit_price: '35',
            craft: 'should not appear',
          },
        ]),
      },
    });
    expect(items[0]).toMatchObject({
      product_service: '金屬襟章',
      description: '紙卡尺寸: 30 x 15mm\n加工工藝: 滴膠\n背扣: 蝴蝶扣',
    });
    expect(items[1]).toMatchObject({
      product_service: 'Shipping',
      description: '',
    });
  });

  it('summarizeHonourCraftDescription skips empty fields', () => {
    expect(
      summarizeHonourCraftDescription({
        ...emptyHonourLine(),
        craft: '亞加力-單面',
        plating_color: '  ',
        clasp: '四節圓圈',
      })
    ).toBe('加工工藝: 亞加力-單面\n背扣: 四節圓圈');
  });

  it('includes Shipping honour line as its own quotation item', () => {
    const items = buildQuotationItemsFromOrder({
      description: '',
      name: '',
      po_number: '',
      fields: {
        order_type: 'honour訂製',
        honour_lines: JSON.stringify([
          { style: '燙貼織嘜', quantity: '300', unit_price: '861' },
          { style: 'Shipping', quantity: '1', unit_price: '35' },
        ]),
      },
    });
    expect(items).toEqual([
      { product_service: '燙貼織嘜', description: '', quantity: 300, unit_price: 861 },
      { product_service: 'Shipping', description: '', quantity: 1, unit_price: 35 },
    ]);
  });

  it('maps bird nest flavors', () => {
    const items = buildQuotationItemsFromOrder({
      description: '',
      name: '',
      po_number: '',
      fields: {
        order_type: '燕窩回禮燉製',
        qty_rock_sugar: '10',
        qty_osmanthus: '5',
        qty_red_date: '0',
        supplier_price: '88',
      },
    });
    expect(items).toHaveLength(2);
    expect(items[0].quantity).toBe(10);
    expect(items[1].quantity).toBe(5);
  });

  it('maps Nestiee lines from Woo nestiee_lines', () => {
    const items = buildQuotationItemsFromOrder({
      description: 'fallback desc',
      name: '',
      po_number: '',
      fields: {
        order_type: 'Nestiee 燕窩訂單',
        nestiee_lines: JSON.stringify([
          { name: '星空金', quantity: 2, unit_price: 344, line_total: 688 },
          { name: '粉紅心意 - 桂花味', quantity: 1, unit_price: 128.5, line_total: 128.5 },
        ]),
      },
    });
    expect(items).toEqual([
      { product_service: '星空金', description: '', quantity: 2, unit_price: 344 },
      { product_service: '粉紅心意 - 桂花味', description: '', quantity: 1, unit_price: 128.5 },
    ]);
  });

  it('includes Shipping nestiee line as its own quotation item', () => {
    const items = buildQuotationItemsFromOrder({
      description: '',
      name: '',
      po_number: '',
      fields: {
        order_type: 'Nestiee 燕窩訂單',
        nestiee_lines: JSON.stringify([
          { name: '星空金', quantity: 1, unit_price: 344, line_total: 344 },
          { name: 'Shipping', quantity: 1, unit_price: 35, line_total: 35 },
        ]),
      },
    });
    expect(items).toEqual([
      { product_service: '星空金', description: '', quantity: 1, unit_price: 344 },
      { product_service: 'Shipping', description: '', quantity: 1, unit_price: 35 },
    ]);
  });

  it('falls back to description when Nestiee has no nestiee_lines', () => {
    const items = buildQuotationItemsFromOrder({
      description: '星空銀 x1',
      name: '',
      po_number: '',
      fields: { order_type: 'Nestiee 燕窩訂單' },
    });
    expect(items).toHaveLength(1);
    expect(items[0].product_service).toBe('星空銀 x1');
    expect(items[0].description).toBe('');
  });
});

describe('buildQuotationNotesFromOrder', () => {
  it('uses order notes and craft/pack fields without PO# or order description', () => {
    const notes = buildQuotationNotesFromOrder({
      notes: 'Rush order',
      po_number: 'PO-99',
      description: 'Badges',
      fields: { pack_required: 'OPP', craft: '滴膠' },
    });
    expect(notes).toContain('Rush order');
    expect(notes).toContain('OPP');
    expect(notes).toContain('滴膠');
    expect(notes).not.toContain('PO-99');
    expect(notes).not.toContain('PO#');
    expect(notes).not.toContain('Badges');
    expect(notes).not.toContain('Description:');
  });
});

describe('quotationValidUntilFromIssueDate', () => {
  it('adds 30 days to the issue date', () => {
    expect(quotationValidUntilFromIssueDate('2026-07-27', 30)).toBe('2026-08-26');
  });
});
