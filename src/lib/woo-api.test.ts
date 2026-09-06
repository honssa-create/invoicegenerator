import { describe, expect, it } from 'vitest';
import {
  appendWooQueryAuth,
  DEFAULT_WOO_USER_AGENT,
  parseWooApiJson,
  wooApiErrorMessage,
  wooRequestHeaders,
} from './woo-api';

describe('parseWooApiJson', () => {
  it('parses valid JSON', () => {
    expect(parseWooApiJson('[{"id":1}]', 'nestiee')).toEqual([{ id: 1 }]);
  });

  it('rejects HTML responses with a helpful message', () => {
    expect(() => parseWooApiJson('<html><head><title>403 Forbidden</title></head></html>', 'nestiee')).toThrow(
      /web page instead of API data/i
    );
  });
});

describe('wooApiErrorMessage', () => {
  it('extracts Woo JSON error messages', () => {
    expect(wooApiErrorMessage(401, '{"message":"Invalid signature."}', 'nestiee')).toMatch(/Invalid signature/);
  });
});

describe('wooRequestHeaders', () => {
  it('sends a complete modern Chrome user-agent (SiteGround requires Chrome version)', () => {
    const ua = wooRequestHeaders()['User-Agent'];
    expect(ua).toBe(DEFAULT_WOO_USER_AGENT);
    expect(ua).toMatch(/Chrome\/\d+\.\d+\.\d+\.\d+/);
    expect(ua).toMatch(/Safari\/537\.36$/);
    expect(ua.length).toBeGreaterThan('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'.length);
  });
});

describe('appendWooQueryAuth', () => {
  it('sets consumer_key and consumer_secret on the query', () => {
    const params = new URLSearchParams({ per_page: '1' });
    appendWooQueryAuth(params, 'ck_test', 'cs_test');
    expect(params.get('consumer_key')).toBe('ck_test');
    expect(params.get('consumer_secret')).toBe('cs_test');
    expect(params.get('per_page')).toBe('1');
  });
});
