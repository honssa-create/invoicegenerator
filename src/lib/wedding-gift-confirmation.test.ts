import { describe, expect, it } from 'vitest';
import { parseChineseDate, parseWeddingGiftConfirmation } from './wedding-gift-confirmation';

const SAMPLE = `【📩*即食燕窩回禮 𝑪𝒐𝒏𝒇𝒊𝒓𝒎𝒂𝒕𝒊𝒐𝒏*】

👰🤵🏻日期 𝑻𝒉𝒆 𝑩𝒊𝒈 𝑫𝒂𝒚：
*2026年7月31日 (Friday)*
Jane Doe (12345678)

🎀🕊️ *45ml 即食燕窩回禮*
數量：100樽
包裝：金色蝴蝶結紗袋包裝 x 100
味道：紅棗 x 50 / 冰糖 x 50

✨💍𝑺𝒑𝒆𝒄𝒊𝒂𝒍 𝑷𝒓𝒊𝒄𝒆 專享優惠:
滿$3,800｜95 折
*$4,275@$42.75/樽* (~原價$45~)
扣減試飲：-$128
其他扣減：-$147
額外費用：$100
*總額：$4,100*

--

📍 收件人 & 送貨地址：
2026年7月30日 / 12 - 5pm 送貨, 
Grand Hyatt Pool Side
香港君悅酒店, 1 Harbour Rd, Wan Chai

💰付款資料：
Honour Label Limited
FPS 識別碼: 110700226

♡ 人數及味道都可以於 𝒃𝒊𝒈 𝒅𝒂𝒚 前1個月前隨時進行調整
♡ 尾數會於 𝒃𝒊𝒈 𝒅𝒂𝒚 前1個月再次聯絡啊～`;

describe('parseChineseDate', () => {
  it('parses YYYY年M月D日', () => {
    expect(parseChineseDate('2026年7月31日 (Friday)')).toBe('2026-07-31');
    expect(parseChineseDate('2026年07月01日')).toBe('2026-07-01');
  });
});

describe('parseWeddingGiftConfirmation', () => {
  it('maps the Honour confirmation sample', () => {
    const result = parseWeddingGiftConfirmation(SAMPLE);
    expect(result.warnings).toEqual([]);
    expect(result.fields).toMatchObject({
      big_day: '2026-07-31',
      expiry_date: '2026-08-28',
      bottle_capacity: '45g',
      qty_red_date: '50',
      qty_rock_sugar: '50',
      qty_osmanthus: '0',
      unit_bottle_price: '42.75',
      client_delivery_date: '2026-07-30',
      receiving_time: '12 - 5pm',
    });
    expect(result.core).toMatchObject({
      name: 'Jane Doe',
      phone: '12345678',
      shipping_address: 'Grand Hyatt Pool Side\n香港君悅酒店, 1 Harbour Rd, Wan Chai',
    });
    expect(result.core.notes).toContain('總額：$4,100');
    expect(result.core.notes).toContain('扣減試飲：-$128');
    expect(result.core.notes).toContain('$4,275@$42.75/樽');
  });

  it('returns warning on empty input', () => {
    const result = parseWeddingGiftConfirmation('   ');
    expect(result.fields).toEqual({});
    expect(result.core).toEqual({});
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('parses 桂花 flavor and 25ml capacity', () => {
    const text = `
日期 The Big Day：
2025年1月5日
Amy Chan (98765432)
25ml 即食燕窩回禮
味道：桂花 x 30 / 冰糖 x 20
$40/樽
收件人 & 送貨地址：
2025年1月4日 / 2-6pm 送貨
Somewhere, HK
付款資料：
`;
    const result = parseWeddingGiftConfirmation(text);
    expect(result.fields.bottle_capacity).toBe('25g');
    expect(result.fields.qty_osmanthus).toBe('30');
    expect(result.fields.qty_rock_sugar).toBe('20');
    expect(result.fields.qty_red_date).toBe('0');
    expect(result.fields.unit_bottle_price).toBe('40');
    expect(result.core.name).toBe('Amy Chan');
    expect(result.fields.receiving_time).toBe('2-6pm');
  });
});
