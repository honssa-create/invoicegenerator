import { describe, expect, it } from 'vitest';
import { isWooDraftOrder, mapWooStatus } from './woocommerce';
import { extractOrderNoFromRemarks } from './reconciliation-server';

describe('mapWooStatus', () => {
  it('maps completed to shipped status', () => {
    expect(mapWooStatus('completed')).toBe('已寄出 SENT');
  });

  it('maps processing to in production', () => {
    expect(mapWooStatus('processing')).toBe('製作中');
  });
});

describe('isWooDraftOrder', () => {
  it('identifies Woo draft statuses', () => {
    expect(isWooDraftOrder('draft')).toBe(true);
    expect(isWooDraftOrder(' WC-DRAFT ')).toBe(true);
  });

  it('keeps non-draft Woo orders importable', () => {
    expect(isWooDraftOrder('pending')).toBe(false);
    expect(isWooDraftOrder('processing')).toBe(false);
  });
});

describe('hub order number extraction for reconciliation', () => {
  it('extracts prefixed system order numbers from remarks', () => {
    expect(extractOrderNoFromRemarks('FPS payment NES-1042')).toBe('NES-1042');
  });
});
