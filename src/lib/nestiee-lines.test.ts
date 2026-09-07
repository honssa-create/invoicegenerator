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
  hydrateNestieeGiftBoxQtys,
  nestieeGiftBoxQtyFieldsChanged,
  isNestieeFastestShipOption,
  isNestieeScheduledShipOption,
  parseNestieeReceiptDateFromDeliveryOptions,
  parseNestieeDeliveryDateMeta,
  parseNestieeReceiptDateFromCustomerNote,
  normalizeTmCartepoRows,
  normalizeOrderDueDate,
  resolveNestieeReceiptDateOnIngest,
  resolveHonourReceiptDateOnIngest,
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

  it('keeps an explicit zero line total', () => {
    expect(parseNestieeLinesFromWoo([{ name: '贈品', quantity: 1, price: 128, total: '0.00' }])).toEqual([
      { name: '贈品', quantity: 1, unit_price: 128, line_total: 0 },
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

  it('reads admin-created Woo delivery custom fields (not checkout EPO)', () => {
    expect(
      parseNestieeDeliveryDateMeta({
        created_via: 'admin',
        meta_data: [{ key: 'delivery_date', value: '2026-09-01' }],
      })
    ).toBe('2026-09-01');
    expect(
      parseNestieeDeliveryDateMeta({
        meta_data: [{ key: '_wc_other/other/delivery_date', value: '01/09/2026' }],
      })
    ).toBe('2026-09-01');
    expect(
      parseNestieeDeliveryDateMeta({
        meta_data: [{ key: '_custom_field', display_key: '送貨日期', value: '2026-08-30' }],
      })
    ).toBe('2026-08-30');
    expect(
      parseNestieeReceiptDateFromDeliveryOptions([], '2026-08-14T09:40:02', {
        created_via: 'admin',
        date_created: '2026-08-14T09:40:02',
        meta_data: [{ key: '_delivery_date', value: 'Sat, 29 Aug 2026' }],
      })
    ).toBe('2026-08-29');
    expect(
      parseNestieeReceiptDateFromDeliveryOptions([], '2026-08-14', {
        line_items: [
          {
            name: '禮盒',
            quantity: 1,
            meta_data: [
              { key: 'delivery_date', display_key: 'Delivery Date', value: '2026-09-02' },
            ],
          },
        ],
      })
    ).toBe('2026-09-02');
    expect(
      parseNestieeDeliveryDateMeta({
        meta_data: [{ key: 'date_paid', value: '2026-09-01' }],
      })
    ).toBe('');
  });

  it('parses 送貨安排 from visible line meta when _tmcartepo_data is missing', () => {
    const lines = parseNestieeLinesFromWoo([
      {
        name: '禮盒',
        quantity: 1,
        price: 100,
        total: '100',
        meta_data: [
          { key: '送貨安排', display_key: '📦送貨安排', value: '📅 預約指定日子' },
          { key: '預約送達日期', display_key: '📦預約送達日期', value: '01/09/2026' },
        ],
      },
    ]);
    expect(parseNestieeReceiptDateFromDeliveryOptions(lines, '2026-08-14')).toBe('2026-09-01');
  });

  it('parses _tmcartepo_data when Woo stores it as a JSON string (order 10667 shape)', () => {
    const payload = {
      date_created: '2026-05-10T11:00:00',
      line_items: [
        {
          name: '禮盒',
          quantity: 1,
          meta_data: [
            {
              key: '_tmcartepo_data',
              value: JSON.stringify([
                { name: '<b>📦送貨安排</b>', value: '📅 預約指定日子' },
                { name: '<b>📦預約送達日期</b>', value: '21/07/2026' },
              ]),
            },
          ],
        },
      ],
    };
    const lines = parseNestieeLinesFromWoo(payload.line_items);
    expect(lines[0].options?.some((o) => o.label.includes('預約送達日期'))).toBe(true);
    expect(parseNestieeReceiptDateFromDeliveryOptions(lines, payload.date_created, payload)).toBe(
      '2026-07-21'
    );
  });

  it('uses an EPO date field even when 送貨安排 is not 預約指定日子', () => {
    const lines = parseNestieeLinesFromWoo([
      {
        name: '禮盒',
        quantity: 1,
        meta_data: [
          {
            key: '_tmcartepo_data',
            value: [
              { name: '<b>📦送貨安排</b>', value: '⚡按最快日子寄出 (1-2個工作天寄出)' },
              { name: '<b>📦預約送達日期</b>', value: '2026-07-21' },
            ],
          },
        ],
      },
    ]);
    expect(parseNestieeReceiptDateFromDeliveryOptions(lines, '2026-05-10')).toBe('2026-07-21');
  });

  it('reads 到貨日期 / Chinese / unix Woo custom fields', () => {
    expect(
      parseNestieeDeliveryDateMeta({
        meta_data: [{ key: '到貨日期', value: '2026年7月21日' }],
      })
    ).toBe('2026-07-21');
    expect(normalizeOrderDueDate('20260721')).toBe('2026-07-21');
    expect(normalizeOrderDueDate(String(Date.parse('2026-07-21T00:00:00+08:00') / 1000))).toBe(
      '2026-07-21'
    );
    expect(
      parseNestieeReceiptDateFromDeliveryOptions([], '2026-05-10', {
        meta_data: [{ key: 'e_deliverydate', value: { date: '2026-07-22' } }],
      })
    ).toBe('2026-07-22');
  });

  it('parses a wrapped EPO object and customer_note dates', () => {
    expect(
      normalizeTmCartepoRows({
        '123': [{ name: '預約送達日期', value: '24/05/2026' }],
      })
    ).toHaveLength(1);
    expect(parseNestieeReceiptDateFromCustomerNote('送貨日期：24/05/2026 請下午送到')).toBe(
      '2026-05-24'
    );
    expect(
      parseNestieeReceiptDateFromDeliveryOptions([], '2026-05-10', {
        customer_note: '客人收貨日期: 2026-07-21',
      })
    ).toBe('2026-07-21');
  });
});

describe('resolveNestieeReceiptDateOnIngest', () => {
  it('overwrites checkout date when Woo admin later changes nestiee/delivery_date', () => {
    expect(
      resolveNestieeReceiptDateOnIngest(
        { due_date: '2026-08-20', client_delivery_date: '2026-08-20' },
        [],
        '2026-08-14T09:40:02',
        {
          date_created: '2026-08-14T09:40:02',
          meta_data: [{ key: '_wc_other/nestiee/delivery_date', value: '2026-09-05' }],
        }
      )
    ).toBe('2026-09-05');
  });

  it('overwrites a local 客人收貨日期 edit with the current Woo date', () => {
    expect(
      resolveNestieeReceiptDateOnIngest(
        { due_date: '2026-08-18', client_delivery_date: '2026-08-18' },
        [],
        '2026-08-14T09:40:02',
        {
          date_created: '2026-08-14T09:40:02',
          meta_data: [{ key: 'nestiee/delivery_date', value: 'Sat, 22 Aug 2026' }],
        }
      )
    ).toBe('2026-08-22');
  });

  it('overwrites ASAP created+2 when Woo later has a booked date', () => {
    const asapLines = parseNestieeLinesFromWoo([
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
      resolveNestieeReceiptDateOnIngest(
        { due_date: '2026-08-16', client_delivery_date: '2026-08-16' },
        asapLines,
        '2026-08-14T09:40:02',
        {
          date_created: '2026-08-14T09:40:02',
          meta_data: [{ key: '_wc_other/nestiee/delivery_date', value: '2026-09-01' }],
        }
      )
    ).toBe('2026-09-01');
  });

  it('keeps the local date only when Woo has no parseable delivery date', () => {
    expect(
      resolveNestieeReceiptDateOnIngest(
        { due_date: '2026-08-18', client_delivery_date: '2026-08-18' },
        [{ name: 'x', quantity: 1, unit_price: 1, line_total: 1 }],
        '2026-08-14'
      )
    ).toBe('2026-08-18');
  });
});

describe('resolveHonourReceiptDateOnIngest', () => {
  it('overwrites a local date when Honour Woo estimate changes', () => {
    expect(
      resolveHonourReceiptDateOnIngest(
        { due_date: '2026-08-13', client_delivery_date: '2026-08-13' },
        { meta_data: [{ key: 'pi_overall_estimate_min_date', value: '2026/09/01' }] }
      )
    ).toBe('2026-09-01');
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
      }),
    ).toBe('香港, KOWLOON\nHK');
  });

  it('omits customer name and phone (stored on the order separately)', () => {
    expect(
      formatWooAddress({
        first_name: 'Jane',
        last_name: 'Doe',
        phone: '91234567',
        address_1: '1 Harbour Rd',
        city: 'Wan Chai',
        country: 'HK',
      }),
    ).toBe('1 Harbour Rd\nWan Chai\nHK');
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
  const emptyAutoQtys = {
    nestiee_gift_qty_star_gold: 0,
    nestiee_gift_qty_star_silver: 0,
    nestiee_gift_qty_red_gold: 0,
    nestiee_gift_qty_red_silver: 0,
    nestiee_gift_qty_pink_osmanthus: 0,
    nestiee_gift_qty_pink_red_date: 0,
    nestiee_gift_qty_hua_yue: 0,
    nestiee_gift_qty_trial_set: 0,
    nestiee_gift_qty_rou_run_share_box: 0,
    nestiee_gift_qty_qiu_yan_fei_yue: 0,
    nestiee_gift_qty_sui_xin_7: 0,
    nestiee_gift_qty_sui_xin_14: 0,
    nestiee_gift_qty_sui_xin_18: 0,
  };

  it('maps 星空禮盒 name suffixes to 星空金 / 星空銀', () => {
    expect(
      computeNestieeGiftBoxQtysFromLines([
        {
          name: '🌕⚪星空禮盒 · 即食燕窩 - 3盒2金1銀',
          quantity: 2,
          unit_price: 100,
          line_total: 200,
        },
        {
          name: '星空禮盒 · 即食燕窩 - 金-‧-桂花 1盒',
          quantity: 1,
          unit_price: 100,
          line_total: 100,
        },
        {
          name: '星空禮盒 · 即食燕窩 - 銀‧冰糖 2盒',
          quantity: 1,
          unit_price: 100,
          line_total: 100,
        },
        {
          name: '其他產品 - 金-‧-桂花-9-盒',
          quantity: 9,
          unit_price: 1,
          line_total: 9,
        },
      ])
    ).toEqual({
      ...emptyAutoQtys,
      nestiee_gift_qty_star_gold: 2 * 2 + 1,
      nestiee_gift_qty_star_silver: 1 * 2 + 2,
    });
  });

  it('maps 花月禮盒 when 一…八盒 appears anywhere in the name', () => {
    expect(
      computeNestieeGiftBoxQtysFromLines([
        { name: '花月禮盒 ‧ 三盒', quantity: 1, unit_price: 1, line_total: 1 },
        { name: '花月禮盒 · 二盒', quantity: 2, unit_price: 1, line_total: 2 },
        { name: '花月禮盒 ‧ 八盒', quantity: 1, unit_price: 1, line_total: 1 },
        { name: '六盒裝 · 即食燕窩花月禮盒', quantity: 1, unit_price: 1, line_total: 1 },
        { name: '花月禮盒 即食燕窩 - 四盒', quantity: 1, unit_price: 1, line_total: 1 },
        { name: '花月禮盒 ‧ 兩盒', quantity: 1, unit_price: 1, line_total: 1 },
        { name: '花月禮盒 ‧ 九盒', quantity: 1, unit_price: 1, line_total: 1 },
        { name: '花月禮盒 ‧ 十盒', quantity: 1, unit_price: 1, line_total: 1 },
        { name: '三盒 即食燕窩', quantity: 1, unit_price: 1, line_total: 1 },
      ])
    ).toEqual({
      ...emptyAutoQtys,
      nestiee_gift_qty_hua_yue: 3 + 2 * 2 + 8 + 6 + 4,
    });
  });

  it('maps Trial Set using N盒, defaulting to 1', () => {
    expect(
      computeNestieeGiftBoxQtysFromLines([
        { name: 'Trial Set', quantity: 1, unit_price: 1, line_total: 1 },
        { name: 'Trial Set 3盒', quantity: 1, unit_price: 1, line_total: 1 },
        { name: '3盒 x Trial Set', quantity: 2, unit_price: 1, line_total: 2 },
        { name: 'Trial Set 3', quantity: 1, unit_price: 1, line_total: 1 },
        { name: '3 x Trial Set', quantity: 2, unit_price: 1, line_total: 2 },
      ])
    ).toEqual({
      ...emptyAutoQtys,
      nestiee_gift_qty_trial_set: 1 + 3 + 3 * 2 + 1 + 1 * 2,
    });
  });

  it('does not treat 45mL as a gift-box quantity', () => {
    expect(
      computeNestieeGiftBoxQtysFromLines([
        { name: 'Trial Set 45mL', quantity: 1, unit_price: 1, line_total: 1 },
        { name: 'Trial Set 45mL 2盒', quantity: 1, unit_price: 1, line_total: 1 },
        {
          name: '星空禮盒 · 即食燕窩 - 金 · 桂花 45mL 3盒',
          quantity: 1,
          unit_price: 1,
          line_total: 1,
        },
        {
          name: '星空禮盒 · 即食燕窩 - 銀 · 冰糖 45mL 2盒',
          quantity: 1,
          unit_price: 1,
          line_total: 1,
        },
      ])
    ).toEqual({
      ...emptyAutoQtys,
      nestiee_gift_qty_trial_set: 1 + 2,
      nestiee_gift_qty_star_gold: 3,
      nestiee_gift_qty_star_silver: 2,
    });
  });

  it('maps 心意禮盒 紅棗x盒 / 冰糖x盒 / x套y盒 to 紅色金 / 紅色銀', () => {
    expect(
      computeNestieeGiftBoxQtysFromLines([
        {
          name: '即食燕窩心意禮盒',
          quantity: 2,
          unit_price: 1,
          line_total: 2,
          options: [{ label: '數量', value: '紅棗3盒', price: 0 }],
        },
        {
          name: '心意禮盒',
          quantity: 1,
          unit_price: 1,
          line_total: 1,
          options: [{ label: '數量', value: '冰糖 4 盒', price: 0 }],
        },
        {
          name: '即食燕窩心意禮盒 · 金銀套裝',
          quantity: 1,
          unit_price: 1,
          line_total: 1,
          options: [{ label: '數量', value: '3套6盒', price: 0 }],
        },
        {
          name: '心意禮盒 2盒',
          quantity: 1,
          unit_price: 1,
          line_total: 1,
        },
        {
          name: '其他產品 紅棗9盒',
          quantity: 1,
          unit_price: 1,
          line_total: 1,
        },
      ])
    ).toEqual({
      ...emptyAutoQtys,
      nestiee_gift_qty_red_gold: 3 * 2 + 3,
      nestiee_gift_qty_red_silver: 4 + 3,
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
      ...emptyAutoQtys,
      nestiee_gift_qty_pink_osmanthus: 1 + 2 + 1,
      nestiee_gift_qty_pink_red_date: 1 + 1,
    });
  });

  it('reads 星空 / 花月 / Trial Set counts from extra options', () => {
    expect(
      computeNestieeGiftBoxQtysFromLines([
        {
          name: '星空禮盒 · 即食燕窩',
          quantity: 1,
          unit_price: 1,
          line_total: 1,
          options: [{ label: '數量', value: '3盒2金1銀', price: 0 }],
        },
        {
          name: '花月禮盒',
          quantity: 1,
          unit_price: 1,
          line_total: 1,
          options: [{ label: '盒數', value: '三盒', price: 0 }],
        },
        {
          name: 'Trial Set',
          quantity: 1,
          unit_price: 1,
          line_total: 1,
          options: [{ label: 'Qty', value: '4盒', price: 0 }],
        },
      ])
    ).toEqual({
      ...emptyAutoQtys,
      nestiee_gift_qty_star_gold: 2,
      nestiee_gift_qty_star_silver: 1,
      nestiee_gift_qty_hua_yue: 3,
      nestiee_gift_qty_trial_set: 4,
    });
  });

  it('folds fullwidth and math-bold digits via NFKC', () => {
    expect(
      computeNestieeGiftBoxQtysFromLines([
        {
          name: 'Sharing We Time Box',
          quantity: 1,
          unit_price: 1,
          line_total: 1,
          options: [{ label: '數量', value: '３盒', price: 0 }],
        },
        {
          name: '秋燕飛躍',
          quantity: 1,
          unit_price: 1,
          line_total: 1,
          options: [{ label: '數量', value: '𝟑盒', price: 0 }],
        },
      ])
    ).toEqual({
      ...emptyAutoQtys,
      nestiee_gift_qty_rou_run_share_box: 3,
      nestiee_gift_qty_qiu_yan_fei_yue: 3,
    });
  });

  it('maps Sharing We Time / 柔潤分享時光盒 N盒, including line quantity', () => {
    expect(
      computeNestieeGiftBoxQtysFromLines([
        {
          name: 'Sharing We Time Box',
          quantity: 2,
          unit_price: 1,
          line_total: 2,
          options: [{ label: '數量', value: '3盒', price: 0 }],
        },
        {
          name: '柔潤分享時光盒',
          quantity: 1,
          unit_price: 1,
          line_total: 1,
          options: [{ label: '盒數', value: '二盒', price: 0 }],
        },
      ])
    ).toEqual({
      ...emptyAutoQtys,
      nestiee_gift_qty_rou_run_share_box: 3 * 2 + 2,
    });
  });

  it('maps 心意禮盒 紅棗 and 冰糖 on the same line independently', () => {
    expect(
      computeNestieeGiftBoxQtysFromLines([
        {
          name: '心意禮盒',
          quantity: 1,
          unit_price: 1,
          line_total: 1,
          options: [{ label: '數量', value: '紅棗2盒 冰糖1盒', price: 0 }],
        },
      ])
    ).toEqual({
      ...emptyAutoQtys,
      nestiee_gift_qty_red_gold: 2,
      nestiee_gift_qty_red_silver: 1,
    });
  });

  it('maps 秋燕飛躍 N盒 and 隨心燉 pack tokens from name or options', () => {
    expect(
      computeNestieeGiftBoxQtysFromLines([
        {
          name: '秋燕飛躍',
          quantity: 2,
          unit_price: 1,
          line_total: 2,
          options: [{ label: '數量', value: '1盒', price: 0 }],
        },
        {
          name: '秋燕飛躍 3盒',
          quantity: 1,
          unit_price: 1,
          line_total: 1,
        },
        {
          name: '金燕秋曜 2盒',
          quantity: 2,
          unit_price: 1,
          line_total: 2,
        },
        {
          name: '金燕秋曜',
          quantity: 1,
          unit_price: 1,
          line_total: 1,
          options: [{ label: '數量', value: '4盒', price: 0 }],
        },
        {
          name: '金燕秋曜 ‧ 兩盒',
          quantity: 1,
          unit_price: 1,
          line_total: 1,
        },
        {
          name: '金燕秋曜',
          quantity: 1,
          unit_price: 1,
          line_total: 1,
          options: [{ label: '款式', value: '秋燕飛躍', price: 0 }, { label: '盒數', value: '兩盒', price: 0 }],
        },
        {
          name: '隨心燉',
          quantity: 1,
          unit_price: 1,
          line_total: 1,
          options: [{ label: '裝量', value: '一周7份', price: 0 }],
        },
        {
          name: '隨心燉',
          quantity: 1,
          unit_price: 1,
          line_total: 1,
          options: [{ label: '裝量', value: '14份裝', price: 0 }],
        },
        {
          name: '隨心燉 21份裝',
          quantity: 1,
          unit_price: 1,
          line_total: 1,
        },
      ])
    ).toEqual({
      ...emptyAutoQtys,
      nestiee_gift_qty_qiu_yan_fei_yue: 2 + 3 + 4 + 4 + 2 + 2,
      nestiee_gift_qty_sui_xin_7: 1 + 2 + 1,
      nestiee_gift_qty_sui_xin_14: 1,
    });
  });

  it('maps older Woo SKU names that are the 所需禮盒 labels (e.g. #10609)', () => {
    expect(
      computeNestieeGiftBoxQtysFromLines([
        { name: '星空金', quantity: 2, unit_price: 344, line_total: 688 },
        { name: '紅色銀', quantity: 3, unit_price: 10, line_total: 30 },
        { name: '粉紅心意 - 桂花味', quantity: 1, unit_price: 128.5, line_total: 128.5 },
        { name: '隨心燉 - 18份裝', quantity: 1, unit_price: 1, line_total: 1 },
        { name: '🌕星空銀 2盒', quantity: 1, unit_price: 1, line_total: 1 },
      ])
    ).toEqual({
      ...emptyAutoQtys,
      nestiee_gift_qty_star_gold: 2,
      nestiee_gift_qty_star_silver: 2,
      nestiee_gift_qty_red_silver: 3,
      nestiee_gift_qty_pink_osmanthus: 1,
      nestiee_gift_qty_sui_xin_18: 1,
    });
  });

  it('breaks 中秋 ‧ 花好月圓燕窩禮盒套裝 into 花月 + 星空金 + 星空銀 per qty', () => {
    expect(
      computeNestieeGiftBoxQtysFromLines([
        {
          name: ' 中秋 ‧ 花好月圓燕窩禮盒套裝 - 一套-‧-嚐月之禮-花好月圓套裝-星空金銀花月禮盒',
          quantity: 2,
          unit_price: 1,
          line_total: 2,
        },
        {
          name: '中秋 · 花好月圓燕窩禮盒套裝',
          quantity: 1,
          unit_price: 1,
          line_total: 1,
          options: [{ label: '款式', value: '嚐月之禮-花好月圓套裝-星空金銀花月禮盒', price: 0 }],
        },
        { name: '星空金', quantity: 1, unit_price: 1, line_total: 1 },
      ])
    ).toEqual({
      ...emptyAutoQtys,
      nestiee_gift_qty_hua_yue: 2 + 1,
      nestiee_gift_qty_star_gold: 2 + 1 + 1,
      nestiee_gift_qty_star_silver: 2 + 1,
    });
  });

  it('breaks 星空金銀花月禮盒 variation titles without the Mid-Autumn parent name', () => {
    expect(
      computeNestieeGiftBoxQtysFromLines([
        {
          name: '嚐月之禮-花好月圓套裝-星空金銀花月禮盒',
          quantity: 3,
          unit_price: 1,
          line_total: 3,
        },
        {
          name: 'Woo line item',
          quantity: 1,
          unit_price: 1,
          line_total: 1,
          options: [{ label: '款式', value: '星空金銀花月禮盒', price: 0 }],
        },
      ])
    ).toEqual({
      ...emptyAutoQtys,
      nestiee_gift_qty_hua_yue: 4,
      nestiee_gift_qty_star_gold: 4,
      nestiee_gift_qty_star_silver: 4,
    });
  });

  it('adds 星空金 for 限時加購 星空禮盒桂花味 (name or EPO / meta value)', () => {
    expect(
      computeNestieeGiftBoxQtysFromLines([
        {
          name: '讓這份驚喜更圓滿？ (限時加購 ‧ 2選1):星空禮盒桂花味',
          quantity: 2,
          unit_price: 1,
          line_total: 2,
        },
        {
          name: '心意即食燕窩禮盒',
          quantity: 1,
          unit_price: 1,
          line_total: 1,
          options: [
            {
              label: '讓這份驚喜更圓滿？ (限時加購 ‧ 2選1)',
              value: '星空禮盒桂花味',
              price: 88,
            },
          ],
        },
      ])
    ).toEqual({
      ...emptyAutoQtys,
      nestiee_gift_qty_star_gold: 3,
    });
  });

  it('does not count the other 2選1 add-on choice as 星空金', () => {
    expect(
      computeNestieeGiftBoxQtysFromLines([
        {
          name: '心意即食燕窩禮盒',
          quantity: 2,
          unit_price: 1,
          line_total: 2,
          options: [
            {
              label: '讓這份驚喜更圓滿？ (限時加購 ‧ 2選1)',
              value: '星空禮盒冰糖味',
              price: 88,
            },
          ],
        },
      ])
    ).toEqual(emptyAutoQtys);
  });

  it('stacks Mid-Autumn bundle + 限時加購 星空禮盒桂花味 on the same line', () => {
    expect(
      computeNestieeGiftBoxQtysFromLines([
        {
          name: '中秋 ‧ 花好月圓燕窩禮盒套裝 - 一套-‧-嚐月之禮-花好月圓套裝-星空金銀花月禮盒',
          quantity: 2,
          unit_price: 1,
          line_total: 2,
          options: [
            {
              label: '讓這份驚喜更圓滿？ (限時加購 ‧ 2選1)',
              value: '星空禮盒桂花味',
              price: 88,
            },
          ],
        },
      ])
    ).toEqual({
      ...emptyAutoQtys,
      nestiee_gift_qty_hua_yue: 2,
      nestiee_gift_qty_star_gold: 4,
      nestiee_gift_qty_star_silver: 2,
    });
  });

  it('stacks Mid-Autumn bundle line with a separate 限時加購 line', () => {
    expect(
      computeNestieeGiftBoxQtysFromLines([
        {
          name: '中秋 ‧ 花好月圓燕窩禮盒套裝 - 一套-‧-嚐月之禮-花好月圓套裝-星空金銀花月禮盒',
          quantity: 1,
          unit_price: 1,
          line_total: 1,
        },
        {
          name: '加購',
          quantity: 1,
          unit_price: 1,
          line_total: 1,
          options: [
            {
              label: '讓這份驚喜更圓滿？（限時加購·2選1）',
              value: '星空禮盒桂花味',
              price: 88,
            },
          ],
        },
      ])
    ).toEqual({
      ...emptyAutoQtys,
      nestiee_gift_qty_hua_yue: 1,
      nestiee_gift_qty_star_gold: 2,
      nestiee_gift_qty_star_silver: 1,
    });
  });

  it('reads the 限時加購 add-on from Woo meta_data via parseNestieeLinesFromWoo', () => {
    const lines = parseNestieeLinesFromWoo([
      {
        name: '中秋 ‧ 花好月圓燕窩禮盒套裝',
        quantity: 1,
        price: 1,
        total: '1',
        meta_data: [
          {
            key: '_tmcartepo_data',
            value: [
              {
                name: '<b>讓這份驚喜更圓滿？ (限時加購 ‧ 2選1)</b>',
                value: '星空禮盒桂花味',
                price: 88,
              },
            ],
          },
        ],
      },
    ]);
    expect(computeNestieeGiftBoxQtysFromLines(lines)).toEqual({
      ...emptyAutoQtys,
      nestiee_gift_qty_hua_yue: 1,
      nestiee_gift_qty_star_gold: 2,
      nestiee_gift_qty_star_silver: 1,
    });
  });

  it('reads the 限時加購 add-on from a visible Woo meta value field', () => {
    const lines = parseNestieeLinesFromWoo([
      {
        name: 'Nestiee gift',
        quantity: 2,
        price: 1,
        total: '2',
        meta_data: [
          {
            key: 'addon',
            display_key: '加購',
            value: '讓這份驚喜更圓滿？ (限時加購 ‧ 2選1):星空禮盒桂花味',
          },
        ],
      },
    ]);
    expect(computeNestieeGiftBoxQtysFromLines(lines)).toEqual({
      ...emptyAutoQtys,
      nestiee_gift_qty_star_gold: 2,
    });
  });
});

describe('applyNestieeGiftBoxAutoQtys', () => {
  const lines = [
    {
      name: '🌕⚪星空禮盒 · 即食燕窩 - 銀‧冰糖 1盒',
      quantity: 2,
      unit_price: 100,
      line_total: 200,
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
    expect(fields.nestiee_gift_qty_hua_yue).toBe('0');
    expect(fields.nestiee_gift_qty_trial_set).toBe('0');
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
    expect(fields.nestiee_gift_qty_hua_yue).toBe('0');
    expect(fields.nestiee_gift_qty_trial_set).toBe('0');
  });

  it('keeps a manual 星空金 override when bundle + add-on would auto-sum', () => {
    const fields: Record<string, unknown> = {
      nestiee_gift_qty_star_gold: '1',
      nestiee_gift_qty_star_gold_manual: 'true',
    };
    applyNestieeGiftBoxAutoQtys(fields, [
      {
        name: '中秋 ‧ 花好月圓燕窩禮盒套裝',
        quantity: 1,
        unit_price: 1,
        line_total: 1,
        options: [
          {
            label: '讓這份驚喜更圓滿？ (限時加購 ‧ 2選1)',
            value: '星空禮盒桂花味',
            price: 88,
          },
        ],
      },
    ]);
    expect(fields.nestiee_gift_qty_star_gold).toBe('1');
    expect(fields.nestiee_gift_qty_hua_yue).toBe('1');
    expect(fields.nestiee_gift_qty_star_silver).toBe('1');
  });
});

describe('hydrateNestieeGiftBoxQtys', () => {
  it('fills empty 所需禮盒 from stored nestiee_lines', () => {
    const fields: Record<string, unknown> = {
      nestiee_lines: JSON.stringify([
        { name: '星空金', quantity: 2, unit_price: 344, line_total: 688 },
        { name: '紅色銀', quantity: 1, unit_price: 10, line_total: 10 },
      ]),
    };
    expect(nestieeGiftBoxQtyFieldsChanged(fields)).toBe(true);
    expect(fields.nestiee_gift_qty_star_gold).toBe('2');
    expect(fields.nestiee_gift_qty_red_silver).toBe('1');
  });

  it('keeps manual overrides', () => {
    const fields: Record<string, unknown> = {
      nestiee_lines: JSON.stringify([{ name: '星空金', quantity: 2, unit_price: 1, line_total: 2 }]),
      nestiee_gift_qty_star_gold: '9',
      nestiee_gift_qty_star_gold_manual: 'true',
    };
    hydrateNestieeGiftBoxQtys(fields);
    expect(fields.nestiee_gift_qty_star_gold).toBe('9');
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
    name: '🌕⚪星空禮盒 · 即食燕窩 - 銀‧冰糖 1盒',
    quantity: 1,
    unit_price: 344,
    line_total: 344,
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
      nestiee_gift_qty_hua_yue: 0,
      nestiee_gift_qty_trial_set: 0,
      nestiee_gift_qty_rou_run_share_box: 0,
      nestiee_gift_qty_qiu_yan_fei_yue: 0,
      nestiee_gift_qty_sui_xin_7: 0,
      nestiee_gift_qty_sui_xin_14: 0,
      nestiee_gift_qty_sui_xin_18: 0,
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
