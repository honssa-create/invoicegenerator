import { describe, expect, it } from 'vitest';
import { isWooDraftOrder, mapWooStatus } from './woocommerce';
import { extractOrderNoFromRemarks } from './reconciliation-server';

describe('mapWooStatus', () => {
  it('maps completed to shipped status', () => {
    expect(mapWooStatus('completed')).toBe('已寄出 SENT');
  });

  it('maps processing and on-hold to in progress', () => {
    expect(mapWooStatus('processing')).toBe('IN PROGRESS 安排中');
    expect(mapWooStatus('on-hold')).toBe('IN PROGRESS 安排中');
  });

  it('maps pending and terminal failures to open', () => {
    expect(mapWooStatus('pending')).toBe('OPEN');
    expect(mapWooStatus('cancelled')).toBe('OPEN');
    expect(mapWooStatus('refunded')).toBe('OPEN');
    expect(mapWooStatus('failed')).toBe('OPEN');
  });

  it('maps unknown Woo statuses to in progress', () => {
    expect(mapWooStatus('custom-status')).toBe('IN PROGRESS 安排中');
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
