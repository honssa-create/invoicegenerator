import { describe, expect, it } from 'vitest';
import { normalizeWooStoreUrl } from './woo-url';

describe('normalizeWooStoreUrl', () => {
  it('adds https when protocol is missing', () => {
    expect(normalizeWooStoreUrl('nestiee.com.hk')).toEqual({
      ok: true,
      url: 'https://nestiee.com.hk',
    });
  });

  it('keeps explicit https URLs', () => {
    expect(normalizeWooStoreUrl('https://nestiee.com.hk/')).toEqual({
      ok: true,
      url: 'https://nestiee.com.hk',
    });
  });

  it('preserves subdirectory store paths like /en', () => {
    expect(normalizeWooStoreUrl('https://honour.com.hk/en')).toEqual({
      ok: true,
      url: 'https://honour.com.hk/en',
    });
    expect(normalizeWooStoreUrl('https://honour.com.hk/en/')).toEqual({
      ok: true,
      url: 'https://honour.com.hk/en',
    });
  });

  it('strips accidental wp-json / wp-admin suffixes from the path', () => {
    expect(normalizeWooStoreUrl('https://honour.com.hk/en/wp-json/wc/v3')).toEqual({
      ok: true,
      url: 'https://honour.com.hk/en',
    });
    expect(normalizeWooStoreUrl('https://honour.com.hk/wp-admin')).toEqual({
      ok: true,
      url: 'https://honour.com.hk',
    });
  });

  it('rejects email-like values', () => {
    const result = normalizeWooStoreUrl('vanessa@honour.com.hk');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/not an email/i);
    }
  });
});
