import { describe, expect, it } from 'vitest';
import {
  collectReceiptUrlsFromRow,
  extractReceiptUrls,
  findReceiptColumnIndex,
} from './expense-import-receipts';

describe('extractReceiptUrls', () => {
  it('pulls plain URLs from text', () => {
    expect(extractReceiptUrls('see https://cdn.test/a.jpg here')).toEqual(['https://cdn.test/a.jpg']);
  });

  it('pulls URLs from HYPERLINK and IMAGE formulas', () => {
    expect(extractReceiptUrls('=HYPERLINK("https://host/a.png","open")')).toEqual(['https://host/a.png']);
    expect(extractReceiptUrls('=IMAGE("https://host/b.webp")')).toEqual(['https://host/b.webp']);
  });
});

describe('collectReceiptUrlsFromRow', () => {
  it('reads the receipt column alias', () => {
    const urls = collectReceiptUrlsFromRow({
      Date: '2026-01-01',
      'Image Link': 'https://cdn.test/r.jpg',
    });
    expect(urls).toContain('https://cdn.test/r.jpg');
  });

  it('scans other columns when receipt column is empty', () => {
    const urls = collectReceiptUrlsFromRow({
      'Image Link': '',
      Notes: 'ref https://cdn.test/other.png',
    });
    expect(urls).toContain('https://cdn.test/other.png');
  });
});

describe('findReceiptColumnIndex', () => {
  it('matches English and Chinese receipt headers', () => {
    expect(findReceiptColumnIndex(['Date', 'Image Link', 'Amount'])).toBe(1);
    expect(findReceiptColumnIndex(['日期', '圖片連結', '金額'])).toBe(1);
  });
});
