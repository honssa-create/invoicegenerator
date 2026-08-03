import { afterEach, describe, expect, it } from 'vitest';
import { isClearDbAllowed } from './clear-db';

describe('isClearDbAllowed', () => {
  const original = process.env.ALLOW_CLEAR_DB;

  afterEach(() => {
    if (original === undefined) delete process.env.ALLOW_CLEAR_DB;
    else process.env.ALLOW_CLEAR_DB = original;
  });

  it('is false when unset', () => {
    delete process.env.ALLOW_CLEAR_DB;
    expect(isClearDbAllowed()).toBe(false);
  });

  it('accepts true / 1 / yes (case-insensitive)', () => {
    for (const v of ['true', 'TRUE', '1', 'yes', 'Yes']) {
      process.env.ALLOW_CLEAR_DB = v;
      expect(isClearDbAllowed()).toBe(true);
    }
  });

  it('rejects other values', () => {
    process.env.ALLOW_CLEAR_DB = 'false';
    expect(isClearDbAllowed()).toBe(false);
  });
});
