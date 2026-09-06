import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RESEND_ORDER_TYPES,
  normalizeResendOrderTypes,
} from './integration-settings';

describe('normalizeResendOrderTypes', () => {
  it('keeps known order types and drops unknown / duplicates', () => {
    expect(
      normalizeResendOrderTypes(['honour訂製', 'Cupmoka', 'honour訂製', 'nope', 12, null]),
    ).toEqual(['honour訂製', 'Cupmoka']);
  });

  it('defaults cover honour and nestiee brands', () => {
    expect(DEFAULT_RESEND_ORDER_TYPES.honour).toEqual(['honour訂製', 'honour en訂製']);
    expect(DEFAULT_RESEND_ORDER_TYPES.nestiee).toEqual(['Nestiee 燕窩訂單', '燕窩回禮燉製']);
    expect(DEFAULT_RESEND_ORDER_TYPES.cupmoka).toEqual(['Cupmoka']);
  });
});
