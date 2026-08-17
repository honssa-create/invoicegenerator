import { describe, expect, it } from 'vitest';
import {
  formatWooAddress,
  getNestieeLines,
  parseNestieeLinesFromWoo,
  parseNestieePaymentFromWoo,
  parseWooShippingTotal,
  parseWooShippingMethod,
  normalizeOrderShippingMethod,
  appendNestieeShippingLine,
  computeNestieeGiftBoxQtysFromLines,
  applyNestieeGiftBoxAutoQtys,
  isNestieeFastestShipOption,
  isNestieeScheduledShipOption,
  parseNestieeReceiptDateFromDeliveryOptions,
  parseNestieeDeliveryDateMeta,
  resolveOrderAddressesForQuotation,
  stripHtml,
  NESTIEE_SHIPPING_LINE_NAME,
} from './orders';

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

  it('parses TM EPO options from _tmcartepo_data (order 10275 shape)', () => {
    const lines = parseNestieeLinesFromWoo([
      {
        name: '即食燕窩心意禮盒 · 金銀套裝',
        quantity: 1,
        price: 578,
        total: '578.0',
        meta_data: [
          {
            key: '_tmcartepo_data',
            value: [
              {
                name: '<b>你想送禮嘅款式</b>',
                value: '✨ 金銀心意套裝（雙味禮盒｜最得體）',
                price: 0,
              },
              {
                name: '<b>選擇套裝數量</b>',
                value: '🍊 小份心意剛剛好｜1套2盒',
                price: 598,
              },
              {
                name: '<b>📦送貨安排</b>',
                value: '⚡按最快日子寄出 (1-2個工作天寄出)',
                price: 0,
              },
            ],
          },
        ],
      },
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0].name).toBe('即食燕窩心意禮盒 · 金銀套裝');
    expect(lines[0].options).toEqual([
      { label: '你想送禮嘅款式', value: '✨ 金銀心意套裝（雙味禮盒｜最得體）', price: 0 },
      { label: '選擇套裝數量', value: '🍊 小份心意剛剛好｜1套2盒', price: 598 },
      { label: '📦送貨安排', value: '⚡按最快日子寄出 (1-2個工作天寄出)', price: 0 },
    ]);
  });
});

describe('parseNestieeReceiptDateFromDeliveryOptions', () => {
  it('matches any 按最快寄出 variant under 送貨安排', () => {
    expect(
      isNestieeFastestShipOption({
        label: '📦送貨安排',
        value: '⚡按最快日子寄出 (1-2個工作天寄出)',
      })
    ).toBe(true);
    expect(
      isNestieeFastestShipOption({
        label: '<b>📦送貨安排</b>',
        value: '⚡按最快日子寄出 (1-2個工作天)',
      })
    ).toBe(true);
    expect(
      isNestieeFastestShipOption({
        label: '📦送貨安排',
        value: '⚡按最快寄出(1-2個工作天)',
      })
    ).toBe(true);
    expect(
      isNestieeFastestShipOption({
        label: '📦送貨安排',
        value: '⚡按最快日子寄出 (4月24日)',
      })
    ).toBe(true);
    expect(
      isNestieeFastestShipOption({
        label: '📦送貨安排',
        value: '📅 預約指定日子',
      })
    ).toBe(false);
    expect(
      isNestieeFastestShipOption({
        label: '📦送貨安排',
        value: '📦5月9日順豐站自取',
      })
    ).toBe(false);
    expect(
      isNestieeFastestShipOption({
        label: '其他選項',
        value: '⚡按最快寄出(1-2個工作天)',
      })
    ).toBe(false);
  });

  it('sets ASAP receipt date to created + 2 calendar days', () => {
    const lines = parseNestieeLinesFromWoo([
      {
        name: '禮盒',
        quantity: 1,
        price: 100,
        total: '100',
        meta_data: [
          {
            key: '_tmcartepo_data',
            value: [
              {
                name: '<b>📦送貨安排</b>',
                value: '⚡按最快日子寄出 (1-2個工作天寄出)',
                price: 0,
              },
            ],
          },
        ],
      },
    ]);
    expect(parseNestieeReceiptDateFromDeliveryOptions(lines, '2026-08-14T09:40:02')).toBe(
      '2026-08-16'
    );
    expect(parseNestieeReceiptDateFromDeliveryOptions(lines, '2026-08-30')).toBe('2026-09-01');
  });

  it('sets 預約指定日子 from companion 預約送達日期 (DD/MM/YYYY)', () => {
    expect(
      isNestieeScheduledShipOption({
        label: '📦送貨安排',
        value: '📅 預約指定日子',
      })
    ).toBe(true);
    const lines = parseNestieeLinesFromWoo([
      {
        name: '禮盒',
        quantity: 1,
        price: 100,
        total: '100',
        meta_data: [
          {
            key: '_tmcartepo_data',
            value: [
              {
                name: '<b>📦送貨安排</b>',
                value: '📅 預約指定日子',
                price: 0,
              },
              {
                name: '<b>📦預約送達日期  | 會提早於到貨日前 2–3 日寄出 (選用順豐寄出)</b>',
                value: '24/05/2026',
                price: 0,
              },
            ],
          },
        ],
      },
    ]);
    expect(parseNestieeReceiptDateFromDeliveryOptions(lines, '2026-05-15T14:43:11')).toBe(
      '2026-05-24'
    );
  });

  it('reads order meta nestiee/delivery_date (outside EPO)', () => {
    expect(
      parseNestieeDeliveryDateMeta({
        meta_data: [{ key: '_wc_other/nestiee/delivery_date', value: '2026-08-20' }],
      })
    ).toBe('2026-08-20');
    expect(
      parseNestieeDeliveryDateMeta({
        meta_data: [{ key: 'nestiee/delivery_date', value: 'Sat, 22 Aug 2026' }],
      })
    ).toBe('2026-08-22');
    expect(
      parseNestieeDeliveryDateMeta({
        meta_data: [{ key: '_wc_other/nestiee/delivery_date', value: '按最快寄出 (1-2個工作天)' }],
      })
    ).toBe('__ASAP__');

    expect(
      parseNestieeReceiptDateFromDeliveryOptions([], '2026-08-14T09:40:02', {
        date_created: '2026-08-14T09:40:02',
        meta_data: [{ key: '_wc_other/nestiee/delivery_date', value: '2026-09-21' }],
      })
    ).toBe('2026-09-21');

    expect(
      parseNestieeReceiptDateFromDeliveryOptions([], '2026-08-14T09:40:02', {
        date_created: '2026-08-14T09:40:02',
        meta_data: [
          { key: '_wc_other/nestiee/delivery_date', value: '按最快寄出 (1-2個工作天)' },
        ],
      })
    ).toBe('2026-08-16');
  });

  it('prefers nestiee/delivery_date meta over EPO options', () => {
    const lines = parseNestieeLinesFromWoo([
      {
        name: '禮盒',
        quantity: 1,
        price: 100,
        meta_data: [
          {
            key: '_tmcartepo_data',
            value: [
              {
                name: '<b>📦送貨安排</b>',
                value: '⚡按最快日子寄出 (1-2個工作天寄出)',
                price: 0,
              },
            ],
          },
        ],
      },
    ]);
    expect(
      parseNestieeReceiptDateFromDeliveryOptions(lines, '2026-08-14', {
        date_created: '2026-08-14',
        meta_data: [{ key: '_wc_other/nestiee/delivery_date', value: '2026-09-01' }],
      })
    ).toBe('2026-09-01');
  });

  it('returns empty when option missing or created date unparseable', () => {
    expect(
      parseNestieeReceiptDateFromDeliveryOptions(
        [{ name: 'x', quantity: 1, unit_price: 1, line_total: 1 }],
        '2026-08-14'
      )
    ).toBe('');
    const lines = parseNestieeLinesFromWoo([
      {
        name: '禮盒',
        quantity: 1,
        price: 100,
        meta_data: [
          {
            key: '_tmcartepo_data',
            value: [
              {
                name: '<b>📦送貨安排</b>',
                value: '⚡按最快日子寄出 (1-2個工作天寄出)',
                price: 0,
              },
            ],
          },
        ],
      },
    ]);
    expect(parseNestieeReceiptDateFromDeliveryOptions(lines, '')).toBe('');
  });
});

describe('getNestieeLines', () => {
  it('parses JSON string from fields including options', () => {
    const lines = getNestieeLines({
      nestiee_lines: JSON.stringify([
        {
          name: '星空銀',
          quantity: 1,
          unit_price: 99,
          line_total: 99,
          options: [{ label: '款式', value: '金', price: 0 }],
        },
      ]),
    });
    expect(lines).toEqual([
      {
        name: '星空銀',
        quantity: 1,
        unit_price: 99,
        line_total: 99,
        options: [{ label: '款式', value: '金', price: 0 }],
      },
    ]);
  });

  it('returns empty on invalid JSON', () => {
    expect(getNestieeLines({ nestiee_lines: '{broken' })).toEqual([]);
  });
});

describe('formatWooAddress / stripHtml', () => {
  it('formats billing parts and strips HTML', () => {
    expect(stripHtml('<b>款式</b>')).toBe('款式');
    expect(
      formatWooAddress({
        city: '香港',
        state: 'KOWLOON',
        country: 'HK',
        phone: '98775249',
      })
    ).toBe('香港, KOWLOON\nHK\nTel: 98775249');
  });
});

describe('parseNestieePaymentFromWoo', () => {
  it('maps Yedpay + Alipay Online meta to Yedpay Alipay', () => {
    const pay = parseNestieePaymentFromWoo({
      payment_method: 'yedpay',
      payment_method_title: 'Yedpay',
      meta_data: [{ key: 'yedpay_payment_method', value: 'Alipay Online' }],
    });
    expect(pay.bank).toBe('Yedpay');
    expect(pay.method).toBe('Yedpay Alipay');
  });
});

describe('resolveOrderAddressesForQuotation', () => {
  it('prefers fields.billing_address for quotation billing', () => {
    expect(
      resolveOrderAddressesForQuotation({
        shipping_address: 'Ship only',
        fields: { billing_address: '香港, KOWLOON\nHK' },
      })
    ).toEqual({
      billingAddress: '香港, KOWLOON\nHK',
      shippingAddress: 'Ship only',
    });
  });

  it('falls back either way when one side missing', () => {
    expect(
      resolveOrderAddressesForQuotation({
        shipping_address: null,
        fields: { billing_address: 'Bill only' },
      })
    ).toEqual({ billingAddress: 'Bill only', shippingAddress: 'Bill only' });
  });
});

describe('computeNestieeGiftBoxQtysFromLines', () => {
  it('maps 星空禮盒 ice-sugar option to 星空銀 and osmanthus to 星空金', () => {
    expect(
      computeNestieeGiftBoxQtysFromLines([
        {
          name: '🌕⚪星空禮盒 · 即食燕窩',
          quantity: 2,
          unit_price: 100,
          line_total: 200,
          options: [{ label: '口味', value: '⚪冰糖原味【最勁典】', price: 0 }],
        },
        {
          name: '🌕⚪星空禮盒 · 即食燕窩',
          quantity: 3,
          unit_price: 100,
          line_total: 300,
          options: [{ label: '口味', value: '🌻 桂花味【花香餘韻】', price: 0 }],
        },
        {
          name: '其他產品',
          quantity: 9,
          unit_price: 1,
          line_total: 9,
          options: [{ label: '口味', value: '⚪冰糖原味【最勁典】', price: 0 }],
        },
      ])
    ).toEqual({
      nestiee_gift_qty_star_gold: 3,
      nestiee_gift_qty_star_silver: 2,
      nestiee_gift_qty_red_gold: 0,
      nestiee_gift_qty_red_silver: 0,
      nestiee_gift_qty_pink_osmanthus: 0,
      nestiee_gift_qty_pink_red_date: 0,
    });
  });

  it('maps 金銀套裝 只選單味 + 金/銀盒 to 紅色金 / 紅色銀', () => {
    expect(
      computeNestieeGiftBoxQtysFromLines([
        {
          name: '即食燕窩心意禮盒 ‧ 金銀套裝',
          quantity: 1,
          unit_price: 500,
          line_total: 500,
          options: [
            { label: '款式', value: '⚪️ 只選單味（紅棗或冰糖）', price: 0 },
            { label: '盒子', value: '🟡 金盒｜紅棗・暖潤', price: 0 },
          ],
        },
        {
          name: '即食燕窩心意禮盒 · 金銀套裝',
          quantity: 4,
          unit_price: 500,
          line_total: 2000,
          options: [
            { label: '款式', value: '⚪️ 只選單味（紅棗或冰糖）', price: 0 },
            { label: '盒子', value: '⚪ 銀盒｜冰糖・清潤', price: 0 },
          ],
        },
      ])
    ).toEqual({
      nestiee_gift_qty_star_gold: 0,
      nestiee_gift_qty_star_silver: 0,
      nestiee_gift_qty_red_gold: 1,
      nestiee_gift_qty_red_silver: 4,
      nestiee_gift_qty_pink_osmanthus: 0,
      nestiee_gift_qty_pink_red_date: 0,
    });
  });

  it('maps Dearest Moment 單盒/雙盒/兩味 to 粉紅心意', () => {
    expect(
      computeNestieeGiftBoxQtysFromLines([
        {
          name: '心意即食燕窩禮盒 ‧ 𝑫𝒆𝒂𝒓𝒆𝒔𝒕 𝑴𝒐𝒎𝒆𝒏𝒕',
          quantity: 1,
          unit_price: 300,
          line_total: 300,
          options: [
            { label: '數量', value: '👑👩 單盒就夠', price: 0 },
            { label: '口味', value: '⚪ 經典滋潤 (桂花&冰糖)', price: 0 },
          ],
        },
        {
          name: '心意即食燕窩禮盒 ‧ 𝑫𝒆𝒂𝒓𝒆𝒔𝒕 𝑴𝒐𝒎𝒆𝒏𝒕',
          quantity: 1,
          unit_price: 300,
          line_total: 300,
          options: [
            { label: '數量', value: '👑👩 單盒就夠', price: 0 },
            { label: '口味', value: '🟡 暖心補氣: (紅棗&冰糖)', price: 0 },
          ],
        },
        {
          name: '心意即食燕窩禮盒 ‧ 𝑫𝒆𝒂𝒓𝒆𝒔𝒕 𝑴𝒐𝒎𝒆𝒏𝒕',
          quantity: 1,
          unit_price: 500,
          line_total: 500,
          options: [
            { label: '數量', value: '🌷雙盒更優惠', price: 0 },
            { label: '口味', value: '⚪ 經典滋潤 (桂花&冰糖)', price: 0 },
          ],
        },
        {
          name: '心意即食燕窩禮盒 ‧ 𝑫𝒆𝒂𝒓𝒆𝒔𝒕 𝑴𝒐𝒎𝒆𝒏𝒕',
          quantity: 1,
          unit_price: 500,
          line_total: 500,
          options: [
            { label: '數量', value: '🌷雙盒更優惠', price: 0 },
            { label: '口味', value: '兩味各一盒', price: 0 },
          ],
        },
      ])
    ).toEqual({
      nestiee_gift_qty_star_gold: 0,
      nestiee_gift_qty_star_silver: 0,
      nestiee_gift_qty_red_gold: 0,
      nestiee_gift_qty_red_silver: 0,
      nestiee_gift_qty_pink_osmanthus: 1 + 2 + 1,
      nestiee_gift_qty_pink_red_date: 1 + 1,
    });
  });
});

describe('applyNestieeGiftBoxAutoQtys', () => {
  const lines = [
    {
      name: '🌕⚪星空禮盒 · 即食燕窩',
      quantity: 2,
      unit_price: 100,
      line_total: 200,
      options: [{ label: '口味', value: '⚪冰糖原味【最勁典】', price: 0 }],
    },
  ];

  it('writes auto qty when not manually edited', () => {
    const fields: Record<string, unknown> = {};
    applyNestieeGiftBoxAutoQtys(fields, lines);
    expect(fields.nestiee_gift_qty_star_silver).toBe('2');
    expect(fields.nestiee_gift_qty_star_gold).toBe('0');
    expect(fields.nestiee_gift_qty_red_gold).toBe('0');
    expect(fields.nestiee_gift_qty_red_silver).toBe('0');
    expect(fields.nestiee_gift_qty_pink_osmanthus).toBe('0');
    expect(fields.nestiee_gift_qty_pink_red_date).toBe('0');
  });

  it('skips qty keys marked manual on re-import', () => {
    const fields: Record<string, unknown> = {
      nestiee_gift_qty_star_silver: '9',
      nestiee_gift_qty_star_silver_manual: 'true',
    };
    applyNestieeGiftBoxAutoQtys(fields, lines);
    expect(fields.nestiee_gift_qty_star_silver).toBe('9');
    expect(fields.nestiee_gift_qty_star_gold).toBe('0');
    expect(fields.nestiee_gift_qty_red_gold).toBe('0');
    expect(fields.nestiee_gift_qty_red_silver).toBe('0');
    expect(fields.nestiee_gift_qty_pink_osmanthus).toBe('0');
    expect(fields.nestiee_gift_qty_pink_red_date).toBe('0');
  });
});

describe('parseWooShippingTotal / parseWooShippingMethod', () => {
  it('prefers top-level shipping_total', () => {
    expect(
      parseWooShippingTotal({
        shipping_total: '35.00',
        shipping_lines: [{ method_title: '順豐', total: '10' }],
      })
    ).toBe(35);
  });

  it('sums shipping_lines when shipping_total missing or zero', () => {
    expect(
      parseWooShippingTotal({
        shipping_total: '0',
        shipping_lines: [
          { method_title: 'SF Express', total: '20' },
          { method_title: 'Extra', total: '5.5' },
        ],
      })
    ).toBe(25.5);
  });

  it('returns first non-empty method_title', () => {
    expect(
      parseWooShippingMethod({
        shipping_lines: [
          { method_title: '', total: '0' },
          { method_title: '香港郵政', total: '12' },
        ],
      })
    ).toBe('香港郵政');
  });
});

describe('normalizeOrderShippingMethod', () => {
  it('maps common Woo titles onto select options', () => {
    expect(normalizeOrderShippingMethod('SF Express')).toBe('SF 順豐');
    expect(normalizeOrderShippingMethod('順豐速運')).toBe('順豐');
    expect(normalizeOrderShippingMethod('EMS')).toBe('EMS');
    expect(normalizeOrderShippingMethod('Hongkong Post')).toBe('香港郵政');
  });

  it('preserves unknown titles', () => {
    expect(normalizeOrderShippingMethod('Store Pickup')).toBe('Store Pickup');
  });
});

describe('appendNestieeShippingLine', () => {
  const product = {
    name: '🌕⚪星空禮盒 · 即食燕窩',
    quantity: 1,
    unit_price: 344,
    line_total: 344,
    options: [{ label: '口味', value: '⚪冰糖原味【最勁典】', price: 0 }],
  };

  it('appends Shipping when total > 0', () => {
    expect(appendNestieeShippingLine([product], 35)).toEqual([
      product,
      { name: NESTIEE_SHIPPING_LINE_NAME, quantity: 1, unit_price: 35, line_total: 35 },
    ]);
  });

  it('omits Shipping when total is zero', () => {
    expect(appendNestieeShippingLine([product], 0)).toEqual([product]);
  });

  it('replaces an existing Shipping row (idempotent)', () => {
    const withOld = appendNestieeShippingLine([product], 10);
    expect(appendNestieeShippingLine(withOld, 20)).toEqual([
      product,
      { name: NESTIEE_SHIPPING_LINE_NAME, quantity: 1, unit_price: 20, line_total: 20 },
    ]);
  });

  it('does not inflate gift-box qtys', () => {
    const lines = appendNestieeShippingLine([product], 35);
    expect(computeNestieeGiftBoxQtysFromLines(lines)).toEqual({
      nestiee_gift_qty_star_gold: 0,
      nestiee_gift_qty_star_silver: 1,
      nestiee_gift_qty_red_gold: 0,
      nestiee_gift_qty_red_silver: 0,
      nestiee_gift_qty_pink_osmanthus: 0,
      nestiee_gift_qty_pink_red_date: 0,
    });
  });
});

describe('customer_note → order notes mapping', () => {
  it('documents that Hub ingest passes Woo customer_note as notes (hub-sync)', () => {
    // ingestWooOrders sets notes: order.customer_note?.trim() || null
    // upsertHubOrder writes on insert; on update only when local notes are empty.
    const customerNote = '  Please gift wrap  ';
    expect(customerNote.trim() || null).toBe('Please gift wrap');
  });
});
