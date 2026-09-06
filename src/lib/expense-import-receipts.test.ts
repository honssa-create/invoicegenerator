import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  collectReceiptUrlsFromRow,
  extractReceiptUrls,
  findReceiptColumnIndex,
} from './expense-import-receipts';

describe('fetchAndStoreReceiptFromUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('saves downloaded images via saveReceipt and keeps source_url as metadata', async () => {
    vi.resetModules();
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    ]);

    const saveReceipt = vi.fn(async () => 'saved-receipt.png');
    vi.doMock('./receipt', () => ({ saveReceipt }));
    vi.doMock('./receipt-storage', () => ({
      shouldKeepRemoteUrlInsteadOfEphemeralSave: () => false,
    }));

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        headers: { get: () => 'image/png' },
        arrayBuffer: async () => png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength),
      }))
    );

    const { fetchAndStoreReceiptFromUrl } = await import('./expense-import-receipts');
    const result = await fetchAndStoreReceiptFromUrl('https://cdn.test/receipt.png', '2');

    expect(saveReceipt).toHaveBeenCalled();
    expect(result).toEqual({
      path: 'saved-receipt.png',
      sourceUrl: 'https://cdn.test/receipt.png',
    });
  });

  it('keeps the remote URL as path on ephemeral production storage', async () => {
    vi.resetModules();
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    ]);

    const saveReceipt = vi.fn(async () => 'saved-receipt.png');
    vi.doMock('./receipt', () => ({ saveReceipt }));
    vi.doMock('./receipt-storage', () => ({
      shouldKeepRemoteUrlInsteadOfEphemeralSave: () => true,
    }));

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        headers: { get: () => 'image/png' },
        arrayBuffer: async () => png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength),
      }))
    );

    const { fetchAndStoreReceiptFromUrl } = await import('./expense-import-receipts');
    const result = await fetchAndStoreReceiptFromUrl('https://cdn.test/receipt.png', '2');

    expect(saveReceipt).not.toHaveBeenCalled();
    expect(result).toEqual({
      path: 'https://cdn.test/receipt.png',
      sourceUrl: 'https://cdn.test/receipt.png',
    });
  });
});

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
