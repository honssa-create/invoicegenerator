import { describe, expect, it } from 'vitest';
import {
  parseHonourLinesFromWoo,
  appendHonourShippingLine,
  extractHonourCpoOptions,
  applyHonourOptionsToLine,
  buildHonourLinesFromWoo,
  collectHonourCpoOptionsFromLines,
  parseHonourCpoNotesFromLines,
  parseHonourEstimateMinDate,
  parseHonourPaymentFromWoo,
  parseHonourLines,
  parseHonourSuppliers,
  ensureHonourSupplierCount,
  honourLinesDerivedFields,
  honourSuppliersDerivedFields,
  honourProductLineCount,
  mergeHonourLinesPreservingLocal,
  emptyHonourLine,
  emptyHonourSupplier,
  pruneStaleOrderFields,
  HONOUR_SHIPPING_LINE_STYLE,
  type WooLineItemLike,
} from './orders';

/** H3341 — 燙貼織嘜 with custom size + 300 qty. */
const ironOnLine: WooLineItemLike = {
  name: '燙貼織嘜',
  quantity: 1,
  price: 861,
  total: '861.00',
  meta_data: [
    { key: '_cpo_product_id', value: '8971', display_key: '_cpo_product_id', display_value: '8971' },
    {
      key: '_uni_cpo_iron_woven_labels_size',
      value: 'custom',
      display_key: '請選擇尺寸(最長邊緣的尺寸)',
      display_value: '自訂',
    },
    {
      key: '_uni_cpo_iron_woven_labels_custom_length',
      value: '26',
      display_key: '請輸入尺寸',
      display_value: '26',
    },
    {
      key: '_uni_cpo_iron_woven_labels_custom_width',
      value: '52',
      display_key: '請輸入尺寸',
      display_value: '52',
    },
    {
      key: '_uni_cpo_iron_woven_labels_quantity',
      value: 'a300',
      display_key: '請選擇數量',
      display_value: '300個',
    },
    {
      key: '_uni_cpo_iron_woven_labels_number_of_colours',
      value: 'a5',
      display_key: '顏色數量',
      display_value: '1 - 5',
    },
    {
      key: '_uni_cpo_iron_woven_labels_upload',
      value: 'instant_upload',
      display_key: '請選擇上傳方式',
      display_value: 'C. 即時上傳',
    },
    {
      key: '_uni_cpo_iron_woven_labels_upload_file',
      value: '18725',
      display_key: '請上傳檔案',
      display_value: 'file.jpg',
    },
  ],
};

/** H3340 — 熱切織嘜 with fixed size + seam. */
const flatWovenLine: WooLineItemLike = {
  name: '熱切織嘜',
  quantity: 1,
  price: 552,
  total: '552.00',
  meta_data: [
    {
      key: '_uni_cpo_flat_woven_labels_size',
      value: 'a30_x_15mm',
      display_key: '請選擇尺寸(最長邊緣的尺寸)',
      display_value: '30 x 15mm',
    },
    {
      key: '_uni_cpo_flat_woven_labels_quantity',
      value: 'a100',
      display_key: '請選擇數量',
      display_value: '100個',
    },
    {
      key: '_uni_cpo_flat_labels_woven_number_of_colours',
      value: 'a5',
      display_key: '顏色數量',
      display_value: '1 - 5',
    },
    {
      key: '_uni_cpo_flat_woven_labels_seam',
      value: 'a7mm_left_right',
      display_key: '車縫緣邊處理(子口位置)',
      display_value: '請於設計左右另加各7mm的子口位置',
    },
  ],
};

/** H3339 — 學校姓名布標. */
const studentLine: WooLineItemLike = {
  name: '學校姓名布標',
  quantity: 1,
  price: 600,
  total: '600.00',
  meta_data: [
    {
      key: '_uni_cpo_student_name_labels_size',
      value: 'a25_x_50mm_',
      display_key: '尺寸',
      display_value: '25 x 50mm (最多兩行文字)',
    },
    {
      key: '_uni_cpo_student_name_labels_number_of_names',
      value: 'a1',
      display_key: '需要訂製姓名的人數',
      display_value: '1',
    },
    {
      key: '_uni_cpo_student_name_labels_qty',
      value: 'a300pcs',
      display_key: '數量',
      display_value: '300pcs',
    },
    {
      key: '_uni_cpo_student_name_labels_font',
      value: 'arial',
      display_key: '字型選擇',
      display_value: 'Arial',
    },
    {
      key: '_uni_cpo_student_name_labels_colours',
      value: 'black',
      display_key: '文字顏色',
      display_value: '黑色',
    },
    {
      key: '_uni_cpo_student_name_labels_row1',
      value: 'Luk Myles',
      display_key: '請輸入於Labels顯示的第一行文字',
      display_value: 'Luk Myles',
    },
  ],
};

describe('parseHonourLinesFromWoo', () => {
  it('uses product name and CPO qty digits (iron-on H3341)', () => {
    expect(parseHonourLinesFromWoo([ironOnLine])).toMatchObject([
      { style: '燙貼織嘜', quantity: '300', unit_price: '2.87' },
    ]);
  });

  it('parses flat woven qty 100', () => {
    expect(parseHonourLinesFromWoo([flatWovenLine])).toMatchObject([
      { style: '熱切織嘜', quantity: '100', unit_price: '5.52' },
    ]);
  });

  it('parses student label qty from _qty key, not 人數', () => {
    expect(parseHonourLinesFromWoo([studentLine])).toMatchObject([
      { style: '學校姓名布標', quantity: '300', unit_price: '2' },
    ]);
  });

  it('falls back to Woo line quantity when no CPO qty', () => {
    expect(parseHonourLinesFromWoo([{ name: 'Simple', quantity: 5, price: 10 }])).toMatchObject([
      { style: 'Simple', quantity: '5', unit_price: '2' },
    ]);
  });
});

describe('appendHonourShippingLine', () => {
  const product = { ...emptyHonourLine(), style: '燙貼織嘜', quantity: '300', unit_price: '861' };

  it('omits Shipping when total is zero (free shipping)', () => {
    expect(appendHonourShippingLine([product], 0)).toEqual([product]);
  });

  it('appends Shipping when total > 0', () => {
    expect(appendHonourShippingLine([product], 35)).toMatchObject([
      product,
      { style: HONOUR_SHIPPING_LINE_STYLE, quantity: '1', unit_price: '35' },
    ]);
  });

  it('replaces an existing Shipping row', () => {
    const withOld = appendHonourShippingLine([product], 10);
    expect(appendHonourShippingLine(withOld, 20)).toMatchObject([
      product,
      { style: HONOUR_SHIPPING_LINE_STYLE, quantity: '1', unit_price: '20' },
    ]);
  });
});

describe('extractHonourCpoOptions / applyHonourOptionsToLine', () => {
  it('maps iron-on custom size; colour count stays in dump only', () => {
    const { options, sizeMeta } = collectHonourCpoOptionsFromLines([ironOnLine]);
    const line = applyHonourOptionsToLine(emptyHonourLine(), options, sizeMeta);
    expect(line.card_size).toBe('26×52');
    expect(line.plating_color).toBe('');
    expect(line.other_options).toContain('請選擇尺寸');
    expect(line.other_options).toContain('顏色數量: 1 - 5');
    expect(line.other_options).toContain('請選擇數量: 300個');
  });

  it('maps flat woven size; seam/colours stay in dump only', () => {
    const { options, sizeMeta } = collectHonourCpoOptionsFromLines([flatWovenLine]);
    const line = applyHonourOptionsToLine(emptyHonourLine(), options, sizeMeta);
    expect(line.card_size).toBe('30 x 15mm');
    expect(line.plating_color).toBe('');
    expect(line.clasp).toBe('');
    expect(line.other_options).toContain('車縫緣邊處理');
    expect(line.other_options).toContain('顏色數量: 1 - 5');
  });

  it('maps student label size; text colour stays in dump only', () => {
    const { options, sizeMeta } = collectHonourCpoOptionsFromLines([studentLine]);
    const line = applyHonourOptionsToLine(emptyHonourLine(), options, sizeMeta);
    expect(line.card_size).toBe('25 x 50mm (最多兩行文字)');
    expect(line.plating_color).toBe('');
    expect(line.other_options).toContain('文字顏色: 黑色');
    expect(line.other_options).toContain('Arial');
    expect(line.other_options).toContain('Luk Myles');
    expect(line.other_options).toContain('人數');
    expect(line.other_options).toContain('尺寸:');
  });

  it('does not overwrite non-empty craft fields on re-import', () => {
    const { options, sizeMeta } = collectHonourCpoOptionsFromLines([flatWovenLine]);
    const line = applyHonourOptionsToLine(
      {
        ...emptyHonourLine(),
        card_size: 'manual size',
        plating_color: 'manual color',
        clasp: 'manual clasp',
        other_options: 'manual dump',
      },
      options,
      sizeMeta
    );
    expect(line.card_size).toBe('manual size');
    expect(line.plating_color).toBe('manual color');
    expect(line.clasp).toBe('manual clasp');
    expect(line.other_options).toBe('manual dump');
  });

  it('skips upload internals from visible options', () => {
    const opts = extractHonourCpoOptions(ironOnLine.meta_data);
    expect(opts.some((o) => /upload|檔案/i.test(o.label))).toBe(false);
    expect(opts.some((o) => o.key.includes('upload_file'))).toBe(false);
  });

  it('maps Honour-specific craft labels to their related fields (not other dump)', () => {
    const line = applyHonourOptionsToLine(emptyHonourLine(), [
      { key: '_uni_cpo_plating', label: '金屬電鍍色', value: '古銅色' },
      { key: '_uni_cpo_back', label: '背面配件', value: '蝴蝶扣' },
      { key: '_uni_cpo_method', label: '做法', value: '滴膠' },
      { key: '_uni_cpo_pack', label: '交貨包裝', value: 'OPP' },
      { key: '_uni_cpo_extra', label: '顏色數量', value: '1 - 5' },
    ]);
    expect(line.plating_color).toBe('古銅色');
    expect(line.clasp).toBe('蝴蝶扣');
    expect(line.craft).toBe('滴膠');
    expect(line.pack_required).toBe('OPP');
    expect(line.other_options).toBe('顏色數量: 1 - 5');
    expect(line.other_options).not.toContain('金屬電鍍色');
  });

  it('extracts 備註(如有) for order notes', () => {
    expect(
      parseHonourCpoNotesFromLines([
        {
          name: '金屬襟章',
          quantity: 1,
          price: 100,
          meta_data: [
            {
              key: '_uni_cpo_badge_notes',
              value: '請跟 Pantone 186C',
              display_key: '備註(如有)',
              display_value: '請跟 Pantone 186C',
            },
          ],
        },
      ])
    ).toBe('請跟 Pantone 186C');
  });
});

describe('per-line honour options / suppliers', () => {
  it('buildHonourLinesFromWoo maps options per product line', () => {
    const lines = buildHonourLinesFromWoo([ironOnLine, flatWovenLine], 35);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatchObject({
      style: '燙貼織嘜',
      quantity: '300',
      card_size: '26×52',
    });
    expect(lines[0].other_options).toContain('顏色數量');
    expect(lines[1]).toMatchObject({
      style: '熱切織嘜',
      quantity: '100',
      card_size: '30 x 15mm',
    });
    expect(lines[1].other_options).toContain('車縫緣邊處理');
    expect(lines[2]).toMatchObject({ style: HONOUR_SHIPPING_LINE_STYLE, unit_price: '35' });
  });

  it('applyHonourOptionsToLine keeps known craft out of other_options', () => {
    const line = applyHonourOptionsToLine(emptyHonourLine(), [
      { key: 'a', label: '做法', value: '滴膠' },
      { key: 'b', label: '顏色數量', value: '3' },
    ]);
    expect(line.craft).toBe('滴膠');
    expect(line.other_options).toBe('顏色數量: 3');
  });

  it('mergeHonourLinesPreservingLocal keeps local craft edits', () => {
    const existing = [
      { ...emptyHonourLine(), style: 'A', quantity: '10', craft: 'manual craft', other_options: 'keep me' },
    ];
    const incoming = [
      { ...emptyHonourLine(), style: 'A', quantity: '20', craft: 'imported', other_options: 'new dump' },
    ];
    expect(mergeHonourLinesPreservingLocal(incoming, existing)[0]).toMatchObject({
      quantity: '20',
      craft: 'manual craft',
      other_options: 'keep me',
    });
  });

  it('seeds legacy craft onto first product line and mirrors on derive', () => {
    const lines = parseHonourLines({
      honour_lines: JSON.stringify([{ style: 'Badge', quantity: '50', unit_price: '3' }]),
      craft: 'legacy craft',
      pack_required: 'OPP',
      other_craft: 'legacy dump',
    });
    expect(lines[0]).toMatchObject({
      style: 'Badge',
      craft: 'legacy craft',
      pack_required: 'OPP',
      other_options: 'legacy dump',
    });
    const derived = honourLinesDerivedFields(lines);
    expect(derived.craft).toBe('legacy craft');
    expect(derived.pack_required).toBe('OPP');
    expect(derived).not.toHaveProperty('other_craft');
    expect(derived).not.toHaveProperty('internal_pack');
  });

  it('pads suppliers to product count without shrinking', () => {
    expect(honourProductLineCount(buildHonourLinesFromWoo([ironOnLine, flatWovenLine], 10))).toBe(2);
    const seeded = parseHonourSuppliers(
      { supplier: '和夫', supplier_price: '4.2' },
      { minCount: 2 }
    );
    expect(seeded).toHaveLength(2);
    expect(seeded[0].supplier).toBe('和夫');
    expect(seeded[1].supplier).toBe('');
    expect(ensureHonourSupplierCount(seeded, 1)).toHaveLength(2);
    const derived = honourSuppliersDerivedFields([
      { ...emptyHonourSupplier(), supplier: 'A', carton_count: '3', supplier_price: '1.5' },
      { ...emptyHonourSupplier(), supplier: 'B' },
    ]);
    expect(derived.supplier_price).toBe('1.5');
    expect(derived).not.toHaveProperty('supplier');
    expect(derived).not.toHaveProperty('mould_print_fee');
    expect(JSON.parse(derived.honour_suppliers)).toHaveLength(2);
  });

  it('prunes stale unused fields_json keys', () => {
    const fields: Record<string, unknown> = {
      requested_delivery: '2026/08/13 - 2026/08/18',
      external_payload: { id: 1 },
      external_sync: true,
      invoice_receipt: 'x',
      craft: 'keep',
    };
    pruneStaleOrderFields(fields);
    expect(fields).toEqual({ craft: 'keep' });
  });
});

describe('parseHonourEstimateMinDate / payment', () => {
  it('normalizes pi overall estimate min date', () => {
    expect(
      parseHonourEstimateMinDate({
        meta_data: [
          { key: 'pi_overall_estimate_min_date', value: '2026/08/13' },
          { key: 'pi_overall_estimate_max_date', value: '2026/08/18' },
        ],
      })
    ).toBe('2026-08-13');
  });

  it('maps FPS payment title', () => {
    const pay = parseHonourPaymentFromWoo({
      payment_method: 'bacs',
      payment_method_title: '「轉數快FPS」 / 銀行轉帳',
    });
    expect(pay.method).toBe('FPS');
    expect(pay.bank).toContain('FPS');
  });
});
