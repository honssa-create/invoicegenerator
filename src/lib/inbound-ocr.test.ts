import { describe, expect, it } from 'vitest';
import {
  extractFieldsFromBoxes,
  hasAnyInboundField,
  ocrExtractFields,
} from '@/lib/inbound-ocr';
import type { OcrBox } from '@/lib/paddle-ocr';

/** Synthetic SF vertical label geometry (寄 above 收, then billing). No real PII. */
function sfSampleBoxes(): OcrBox[] {
  return [
    { text: 'SF EXPRESS', score: 0.99, x0: 20, y0: 10, x1: 120, y1: 30 },
    { text: '第1次打印 打印时间 2024-07-29 19:54:31', score: 0.95, x0: 100, y0: 40, x1: 400, y1: 55 },
    { text: '2/2', score: 0.99, x0: 200, y0: 20, x1: 230, y1: 35 },
    { text: 'www.sf-express.com', score: 0.99, x0: 300, y0: 20, x1: 450, y1: 35 },
    // 寄 midY = 120; sender midY = 100 → slightly above 寄
    { text: '寄', score: 0.99, x0: 10, y0: 100, x1: 40, y1: 140 },
    { text: '测试寄件人', score: 0.97, x0: 50, y0: 90, x1: 150, y1: 110 },
    { text: '母单号', score: 0.98, x0: 50, y0: 115, x1: 110, y1: 135 },
    { text: '广东省深圳市南山区科技园路1号', score: 0.96, x0: 50, y0: 145, x1: 360, y1: 165 },
    { text: 'A座1001室', score: 0.95, x0: 50, y0: 170, x1: 150, y1: 190 },
    { text: '收', score: 0.99, x0: 10, y0: 220, x1: 40, y1: 260 },
    { text: '测试收件人', score: 0.97, x0: 50, y0: 225, x1: 150, y1: 245 },
    { text: '香港九龙尖沙咀弥敦道100号', score: 0.96, x0: 50, y0: 250, x1: 340, y1: 270 },
    { text: '费用合计', score: 0.98, x0: 50, y0: 300, x1: 120, y1: 320 },
    { text: '28.00', score: 0.99, x0: 210, y0: 300, x1: 270, y1: 320 },
    { text: '寄付现结', score: 0.97, x0: 130, y0: 300, x1: 200, y1: 320 },
    // Waybill often outside the 寄 band (e.g. barcode / footer area)
    { text: 'SF1234567890123', score: 0.99, x0: 80, y0: 360, x1: 280, y1: 380 },
    { text: '实际重量:0.500 KG', score: 0.97, x0: 50, y0: 340, x1: 200, y1: 355 },
    { text: '包', score: 0.99, x0: 180, y0: 400, x1: 220, y1: 440 },
    { text: 'JC-ZJEK-2511-D', score: 0.95, x0: 300, y0: 430, x1: 420, y1: 450 },
  ];
}

describe('extractFieldsFromBoxes (SF 寄/收)', () => {
  it('extracts waybill, sender, and addresses from region bands', () => {
    const fields = extractFieldsFromBoxes(sfSampleBoxes());
    expect(fields.waybill_number).toBe('SF1234567890123');
    expect(fields.sender).toBe('测试寄件人');
    expect(fields.sender_address).toContain('广东省深圳市');
    expect(fields.sender_address).toContain('A座1001室');
    expect(fields.receiver_address).toContain('测试收件人');
    expect(fields.receiver_address).toContain('尖沙咀');
    expect(fields.receiver_address).not.toContain('费用合计');
    expect(fields.receiver_address).not.toContain('JC-ZJEK');
    expect(fields.amount).toBe(28);
  });

  it('prefers sender name slightly above 寄 over lower name-like lines', () => {
    const boxes: OcrBox[] = [
      // 寄 midY = 120
      { text: '寄', score: 0.99, x0: 10, y0: 100, x1: 40, y1: 140 },
      { text: '正确寄件人', score: 0.97, x0: 50, y0: 88, x1: 160, y1: 108 }, // midY 98, above 寄
      { text: '母单号', score: 0.98, x0: 50, y0: 115, x1: 110, y1: 135 },
      { text: '错误下层名', score: 0.97, x0: 50, y0: 150, x1: 150, y1: 170 }, // midY 160, below 寄
      { text: '广东省深圳市南山区', score: 0.96, x0: 50, y0: 175, x1: 300, y1: 195 },
      { text: '收', score: 0.99, x0: 10, y0: 230, x1: 40, y1: 270 },
      { text: '收件地址一行', score: 0.96, x0: 50, y0: 240, x1: 200, y1: 260 },
      { text: '费用合计', score: 0.98, x0: 50, y0: 300, x1: 120, y1: 320 },
      { text: 'SF1234567890123', score: 0.99, x0: 80, y0: 360, x1: 280, y1: 380 },
    ];
    const fields = extractFieldsFromBoxes(boxes);
    expect(fields.sender).toBe('正确寄件人');
    expect(fields.sender).not.toBe('错误下层名');
    expect(fields.waybill_number).toBe('SF1234567890123');
  });

  it('keeps street-level address lines via looksLikeAddress', () => {
    const boxes: OcrBox[] = [
      { text: '寄', score: 0.99, x0: 10, y0: 100, x1: 40, y1: 140 },
      { text: '测试寄件人', score: 0.97, x0: 50, y0: 88, x1: 140, y1: 108 },
      { text: '广东省深圳市南山区科技园路1号', score: 0.96, x0: 50, y0: 145, x1: 360, y1: 165 },
      { text: 'A座1001室', score: 0.95, x0: 50, y0: 170, x1: 150, y1: 190 },
      { text: '收', score: 0.99, x0: 10, y0: 220, x1: 40, y1: 260 },
      { text: '香港九龙尖沙咀弥敦道100号', score: 0.96, x0: 50, y0: 230, x1: 340, y1: 250 },
      { text: '费用合计', score: 0.98, x0: 50, y0: 320, x1: 120, y1: 340 },
      { text: 'SF1234567890123', score: 0.99, x0: 80, y0: 380, x1: 280, y1: 400 },
    ];
    const fields = extractFieldsFromBoxes(boxes);
    expect(fields.sender_address).toContain('广东省深圳市');
    expect(fields.sender_address).toContain('A座1001室');
    expect(fields.receiver_address).toContain('尖沙咀');
  });

  it('keeps second address lines containing 公司', () => {
    const boxes: OcrBox[] = [
      { text: '寄', score: 0.99, x0: 10, y0: 100, x1: 40, y1: 140 },
      { text: '测试寄件人', score: 0.97, x0: 50, y0: 88, x1: 140, y1: 108 },
      { text: '广东省深圳市南山区', score: 0.96, x0: 50, y0: 145, x1: 280, y1: 165 },
      { text: '某某贸易公司', score: 0.95, x0: 50, y0: 170, x1: 180, y1: 190 },
      { text: '多余短名', score: 0.9, x0: 200, y0: 170, x1: 280, y1: 190 },
      { text: '收', score: 0.99, x0: 10, y0: 220, x1: 40, y1: 260 },
      { text: '香港九龙', score: 0.96, x0: 50, y0: 230, x1: 160, y1: 250 },
      { text: '收件商贸公司', score: 0.95, x0: 50, y0: 255, x1: 180, y1: 275 },
      { text: '费用合计', score: 0.98, x0: 50, y0: 320, x1: 120, y1: 340 },
      { text: 'SF1234567890123', score: 0.99, x0: 80, y0: 380, x1: 280, y1: 400 },
    ];
    const fields = extractFieldsFromBoxes(boxes);
    expect(fields.sender_address).toContain('广东省深圳市');
    expect(fields.sender_address).toContain('某某贸易公司');
    expect(fields.sender_address).not.toContain('多余短名');
    expect(fields.receiver_address).toContain('收件商贸公司');
  });

  it('finds SF waybill outside the 寄 band', () => {
    const boxes: OcrBox[] = [
      { text: '寄', score: 0.99, x0: 10, y0: 100, x1: 40, y1: 140 },
      { text: '测试寄件人', score: 0.97, x0: 50, y0: 88, x1: 140, y1: 108 },
      { text: '广东省深圳市', score: 0.96, x0: 50, y0: 145, x1: 200, y1: 165 },
      { text: '收', score: 0.99, x0: 10, y0: 200, x1: 40, y1: 240 },
      { text: '香港九龙', score: 0.96, x0: 50, y0: 210, x1: 200, y1: 230 },
      { text: '费用合计', score: 0.98, x0: 50, y0: 280, x1: 120, y1: 300 },
      { text: 'SF9876543210987', score: 0.99, x0: 40, y0: 400, x1: 250, y1: 420 },
    ];
    const fields = extractFieldsFromBoxes(boxes);
    expect(fields.waybill_number).toBe('SF9876543210987');
    expect(fields.sender).toBe('测试寄件人');
  });

  it('uses SF token anywhere, not sender phone beside the name', () => {
    const boxes: OcrBox[] = [
      { text: '寄', score: 0.99, x0: 10, y0: 100, x1: 40, y1: 140 },
      { text: '测试寄件人', score: 0.97, x0: 50, y0: 88, x1: 140, y1: 108 },
      { text: '母单号', score: 0.98, x0: 50, y0: 115, x1: 110, y1: 135 },
      { text: '13800138000', score: 0.97, x0: 150, y0: 88, x1: 270, y1: 108 },
      { text: '广东省深圳市南山区科技园路1号', score: 0.96, x0: 50, y0: 145, x1: 360, y1: 165 },
      { text: '收', score: 0.99, x0: 10, y0: 220, x1: 40, y1: 260 },
      { text: '香港九龙尖沙咀弥敦道100号', score: 0.96, x0: 50, y0: 230, x1: 340, y1: 250 },
      { text: '费用合计', score: 0.98, x0: 50, y0: 300, x1: 120, y1: 320 },
      { text: 'SF4440123456789', score: 0.99, x0: 60, y0: 380, x1: 240, y1: 400 },
    ];
    const fields = extractFieldsFromBoxes(boxes);
    expect(fields.waybill_number).toBe('SF4440123456789');
    expect(fields.waybill_number).not.toBe('13800138000');
    expect(fields.sender).toBe('测试寄件人');
  });

  it('ignores bare digit runs next to 母单号 when no SF token exists', () => {
    const boxes: OcrBox[] = [
      { text: '寄', score: 0.99, x0: 10, y0: 100, x1: 40, y1: 140 },
      { text: '测试寄件人', score: 0.97, x0: 50, y0: 88, x1: 140, y1: 108 },
      { text: '母单号', score: 0.98, x0: 50, y0: 115, x1: 110, y1: 135 },
      { text: '4440123456789', score: 0.99, x0: 115, y0: 115, x1: 260, y1: 135 },
      { text: '收', score: 0.99, x0: 10, y0: 200, x1: 40, y1: 240 },
      { text: '香港九龙', score: 0.96, x0: 50, y0: 210, x1: 200, y1: 230 },
      { text: '费用合计', score: 0.98, x0: 50, y0: 280, x1: 120, y1: 300 },
    ];
    const fields = extractFieldsFromBoxes(boxes);
    expect(fields.waybill_number).toBeNull();
  });

  it('falls back to label regex when 寄/收 missing', () => {
    const boxes: OcrBox[] = [
      { text: '运单号: SF9998887776665', score: 1, x0: 0, y0: 0, x1: 100, y1: 20 },
      { text: '寄件人: 张三', score: 1, x0: 0, y0: 30, x1: 100, y1: 50 },
      { text: '寄件地址: 广州市天河区', score: 1, x0: 0, y0: 60, x1: 200, y1: 80 },
      { text: '收件地址: 北京市朝阳区', score: 1, x0: 0, y0: 90, x1: 200, y1: 110 },
    ];
    const fields = extractFieldsFromBoxes(boxes);
    expect(fields.waybill_number).toMatch(/SF9998887776665/i);
    expect(fields.sender).toBe('张三');
    expect(fields.sender_address).toContain('广州市');
    expect(fields.receiver_address).toContain('北京市');
  });

  it('extracts inline 费用合计 amount from one box', () => {
    const boxes: OcrBox[] = [
      { text: '寄', score: 0.99, x0: 10, y0: 100, x1: 40, y1: 140 },
      { text: '测试寄件人', score: 0.97, x0: 50, y0: 88, x1: 140, y1: 108 },
      { text: '收', score: 0.99, x0: 10, y0: 200, x1: 40, y1: 240 },
      { text: '香港九龙', score: 0.96, x0: 50, y0: 210, x1: 200, y1: 230 },
      { text: '费用合计: 36.50', score: 0.98, x0: 50, y0: 280, x1: 180, y1: 300 },
      { text: 'SF1234567890123', score: 0.99, x0: 80, y0: 360, x1: 280, y1: 380 },
    ];
    expect(extractFieldsFromBoxes(boxes).amount).toBe(36.5);
  });

  it('extracts 代收金额 from label row', () => {
    const boxes: OcrBox[] = [
      { text: '寄', score: 0.99, x0: 10, y0: 100, x1: 40, y1: 140 },
      { text: '测试寄件人', score: 0.97, x0: 50, y0: 88, x1: 140, y1: 108 },
      { text: '收', score: 0.99, x0: 10, y0: 200, x1: 40, y1: 240 },
      { text: '香港九龙', score: 0.96, x0: 50, y0: 210, x1: 200, y1: 230 },
      { text: '代收金额', score: 0.98, x0: 50, y0: 280, x1: 130, y1: 300 },
      { text: '150.00', score: 0.99, x0: 140, y0: 280, x1: 210, y1: 300 },
      { text: 'SF1234567890123', score: 0.99, x0: 80, y0: 360, x1: 280, y1: 380 },
    ];
    expect(extractFieldsFromBoxes(boxes).amount).toBe(150);
  });

  it('ignores weight KG values as amount', () => {
    const boxes: OcrBox[] = [
      { text: '寄', score: 0.99, x0: 10, y0: 100, x1: 40, y1: 140 },
      { text: '测试寄件人', score: 0.97, x0: 50, y0: 88, x1: 140, y1: 108 },
      { text: '收', score: 0.99, x0: 10, y0: 200, x1: 40, y1: 240 },
      { text: '香港九龙', score: 0.96, x0: 50, y0: 210, x1: 200, y1: 230 },
      { text: '实际重量:0.500 KG', score: 0.97, x0: 50, y0: 280, x1: 200, y1: 300 },
      { text: 'SF1234567890123', score: 0.99, x0: 80, y0: 360, x1: 280, y1: 380 },
    ];
    expect(extractFieldsFromBoxes(boxes).amount).toBeNull();
  });

  it('returns empty fields for empty boxes', () => {
    expect(extractFieldsFromBoxes([])).toEqual({
      waybill_number: null,
      sender: null,
      sender_address: null,
      receiver_address: null,
      amount: null,
    });
  });
});

describe('ocrExtractFields', () => {
  it('parses flat tesseract-style text', () => {
    const text = [
      'SF EXPRESS',
      '运单号: 1234567890123',
      '寄件人: 李四',
      '寄件地址: 上海市浦东新区',
      '世纪大道1号',
      '收件地址: 杭州市西湖区文三路',
    ].join('\n');
    const fields = ocrExtractFields(text);
    expect(fields.waybill_number).toBe('1234567890123');
    expect(fields.sender).toBe('李四');
    expect(fields.sender_address).toContain('上海市');
    expect(fields.receiver_address).toContain('杭州市');
  });

  it('parses amount from flat billing line', () => {
    const text = ['费用合计: 42.00', 'SF1234567890123'].join('\n');
    expect(ocrExtractFields(text).amount).toBe(42);
  });
});

describe('hasAnyInboundField', () => {
  it('detects partial fills', () => {
    expect(hasAnyInboundField({ waybill_number: '1', sender: null, sender_address: null, receiver_address: null, amount: null })).toBe(true);
    expect(hasAnyInboundField({ waybill_number: null, sender: null, sender_address: null, receiver_address: null, amount: 28 })).toBe(true);
    expect(hasAnyInboundField({ waybill_number: null, sender: null, sender_address: null, receiver_address: null, amount: null })).toBe(false);
  });
});
