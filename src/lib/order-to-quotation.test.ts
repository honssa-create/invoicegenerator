import { describe, expect, it } from 'vitest';
import {
  buildQuotationItemsFromOrder,
  buildQuotationNotesFromOrder,
  parseNumericFromText,
  parseOrderDate,
  quotationValidUntilFromIssueDate,
} from './order-to-quotation';

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
  it('maps badge orders', () => {
    const items = buildQuotationItemsFromOrder({
      description: '4款亞加力',
      name: 'Jane',
      po_number: 'PO-1',
      fields: {
        order_type: '訂製襟章',
        badge_style: '亞加力雙面',
        badge_quantity: '100',
        supplier_price: 'rmb 12.5',
      },
    });
    expect(items).toHaveLength(1);
    expect(items[0].description).toContain('亞加力雙面');
    expect(items[0].quantity).toBe(100);
    expect(items[0].unit_price).toBe(12.5);
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
});

describe('buildQuotationNotesFromOrder', () => {
  it('combines order metadata', () => {
    const notes = buildQuotationNotesFromOrder({
      notes: 'Rush order',
      po_number: 'PO-99',
      description: 'Badges',
      fields: { pack_required: 'OPP' },
    });
    expect(notes).toContain('Rush order');
    expect(notes).toContain('PO-99');
    expect(notes).toContain('OPP');
  });
});

describe('quotationValidUntilFromIssueDate', () => {
  it('adds 30 days to the issue date', () => {
    expect(quotationValidUntilFromIssueDate('2026-07-27', 30)).toBe('2026-08-26');
  });
});
