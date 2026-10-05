import { describe, expect, it } from 'vitest';
import { isKitchenPrepStatusOnlyPatch, parsePrepStatusPatch } from './kitchen-prep-patch';

describe('isKitchenPrepStatusOnlyPatch', () => {
  it('accepts lone status field', () => {
    expect(isKitchenPrepStatusOnlyPatch({ status: 'prepped' })).toBe(true);
    expect(parsePrepStatusPatch({ status: 'prepped' })).toBe('prepped');
  });

  it('rejects patches with extra fields', () => {
    expect(isKitchenPrepStatusOnlyPatch({ status: 'stewing', notes: 'x' })).toBe(false);
    expect(isKitchenPrepStatusOnlyPatch({ qty_osmanthus: 1 })).toBe(false);
  });
});
