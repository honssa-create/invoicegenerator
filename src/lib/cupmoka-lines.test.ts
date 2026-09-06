import { describe, expect, it } from 'vitest';
import {
  CUPMOKA_ORDER_STATUSES,
  STATUS_COLORS,
  STATUS_COLUMN_ACCENT,
  STATUS_COLUMN_BG,
  STATUS_DOT_COLORS,
  appendCupmokaShippingLine,
  formatWooAddress,
  getCupmokaLines,
  normalizeOrderShippingMethod,
  parseCupmokaLinesFromWoo,
  parseCupmokaPaymentFromWoo,
  parseCupmokaShipmentTracking,
  parseWooShippingMethod,
  parseWooShippingTotal,
  statusesForOrderType,
} from './orders';

/** Redacted fixture from Cupmoka Woo order #3173. */
const SAMPLE_3173 = {
  id: 3173,
  status: 'completed',
  total: '680.0',
  shipping_total: '0.0',
  payment_method: 'ppcp-gateway',
  payment_method_title: 'PayPal',
  date_paid: '2026-05-27T16:36:16',
  billing: {
    first_name: '',
    last_name: '',
    city: '　　九龍塘',
    state: 'KOWLOON',
    postcode: '0000',
    country: 'HK',
  },
  shipping_lines: [
    {
      method_title: '✨ 順豐自取或上門直送',
      method_id: 'free_shipping',
      total: '0.0',
    },
  ],
  line_items: [
    {
      name: '麝香貓咖啡粉 (貓屎咖啡)',
      quantity: 1,
      price: 680,
      total: '680.0',
      meta_data: [{ key: '_wdp_cart_item_key', value: 'x', display_key: '_wdp_cart_item_key' }],
      image: { src: 'https://cupmoka.com.hk/wp-content/uploads/2024/11/Mokker-43-1.png' },
    },
  ],
  meta_data: [
    {
      key: '_wc_shipment_tracking_items',
      value: [
        {
          tracking_provider: 'sf-express',
          tracking_number: '',
          status_shipped: '1',
        },
      ],
    },
  ],
};

describe('Cupmoka statuses', () => {
  it('exposes Cupmoka status list for order type Cupmoka', () => {
    expect(statusesForOrderType('Cupmoka')).toEqual([...CUPMOKA_ORDER_STATUSES]);
  });

  it('defines colors for every Cupmoka status', () => {
    for (const status of CUPMOKA_ORDER_STATUSES) {
      expect(STATUS_COLORS[status], status).toBeTruthy();
      expect(STATUS_COLUMN_BG[status], status).toBeTruthy();
      expect(STATUS_COLUMN_ACCENT[status], status).toBeTruthy();
      expect(STATUS_DOT_COLORS[status], status).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});

describe('Cupmoka Woo parsers (sample #3173)', () => {
  it('parses catalog line items with image and ignores underscore meta', () => {
    const lines = parseCupmokaLinesFromWoo(SAMPLE_3173.line_items);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      name: '麝香貓咖啡粉 (貓屎咖啡)',
      quantity: 1,
      unit_price: 680,
      line_total: 680,
      image: 'https://cupmoka.com.hk/wp-content/uploads/2024/11/Mokker-43-1.png',
    });
    expect(lines[0].options).toBeUndefined();
  });

  it('does not append a Shipping line when shipping_total is 0', () => {
    const product = parseCupmokaLinesFromWoo(SAMPLE_3173.line_items);
    const withShip = appendCupmokaShippingLine(product, parseWooShippingTotal(SAMPLE_3173));
    expect(withShip).toHaveLength(1);
    expect(withShip[0].name).not.toBe('Shipping');
  });

  it('appends Shipping when shipping total > 0', () => {
    const product = parseCupmokaLinesFromWoo(SAMPLE_3173.line_items);
    const withShip = appendCupmokaShippingLine(product, 35);
    expect(withShip).toHaveLength(2);
    expect(withShip[1]).toMatchObject({
      name: 'Shipping',
      quantity: 1,
      unit_price: 35,
      line_total: 35,
    });
  });

  it('maps SF shipping title to 順豐', () => {
    const title = parseWooShippingMethod(SAMPLE_3173);
    expect(normalizeOrderShippingMethod(title)).toBe('順豐');
  });

  it('parses PayPal payment title and date_paid', () => {
    const pay = parseCupmokaPaymentFromWoo(SAMPLE_3173);
    expect(pay.bank).toBe('PayPal');
    expect(pay.method).toBe('其他(請備註)');
    expect(pay.note).toBe('PayPal');
    expect(pay.datePaid).toBe('2026-05-27');
  });

  it('reads SF tracking meta without wiping when number empty', () => {
    const tracking = parseCupmokaShipmentTracking(SAMPLE_3173);
    expect(tracking.tracking_no).toBe('');
    expect(tracking.shipping_method_hint).toBe('SF 順豐');
  });

  it('fills tracking_no when present', () => {
    const tracking = parseCupmokaShipmentTracking({
      meta_data: [
        {
          key: '_wc_shipment_tracking_items',
          value: [{ tracking_provider: 'sf-express', tracking_number: 'SF1234567890' }],
        },
      ],
    });
    expect(tracking.tracking_no).toBe('SF1234567890');
  });

  it('strips fullwidth spaces in Woo addresses', () => {
    expect(formatWooAddress(SAMPLE_3173.billing)).toContain('九龍塘');
    expect(formatWooAddress(SAMPLE_3173.billing)).not.toMatch(/\u3000/);
  });

  it('round-trips getCupmokaLines from JSON', () => {
    const lines = appendCupmokaShippingLine(
      parseCupmokaLinesFromWoo(SAMPLE_3173.line_items),
      0
    );
    const stored = getCupmokaLines({ cupmoka_lines: JSON.stringify(lines) });
    expect(stored).toEqual(lines);
  });
});
