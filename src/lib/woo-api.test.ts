import { describe, expect, it } from 'vitest';
import { parseWooApiJson, wooApiErrorMessage } from './woo-api';

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
