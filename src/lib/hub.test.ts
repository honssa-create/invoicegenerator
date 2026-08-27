import { describe, expect, it } from 'vitest';
import { isWooDraftOrder, mapCupmokaWooStatus, mapNestieeWooStatus, mapWooStatus } from './woocommerce';
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

describe('mapNestieeWooStatus', () => {
  it('maps only exact Woo statuses', () => {
    expect(mapNestieeWooStatus('pending')).toBe('pending payment');
    expect(mapNestieeWooStatus('processing')).toBe('processing');
    expect(mapNestieeWooStatus('shipped')).toBe('shipped');
    expect(mapNestieeWooStatus('completed')).toBe('completed');
  });

  it('drops unmatched Woo statuses', () => {
    expect(mapNestieeWooStatus('checkout-draft')).toBeNull();
    expect(mapNestieeWooStatus('draft')).toBeNull();
    expect(mapNestieeWooStatus('on-hold')).toBeNull();
    expect(mapNestieeWooStatus('failed')).toBeNull();
    expect(mapNestieeWooStatus('cancelled')).toBeNull();
    expect(mapNestieeWooStatus('refunded')).toBeNull();
    expect(mapNestieeWooStatus('wc-shipped')).toBeNull();
    expect(mapNestieeWooStatus('custom-status')).toBeNull();
    expect(mapNestieeWooStatus('')).toBeNull();
  });
});

describe('mapCupmokaWooStatus', () => {
  it('maps pending and failed to 等待付款中', () => {
    expect(mapCupmokaWooStatus('pending')).toBe('等待付款中');
    expect(mapCupmokaWooStatus('failed')).toBe('等待付款中');
  });

  it('maps processing and on-hold', () => {
    expect(mapCupmokaWooStatus('processing')).toBe('處理中');
    expect(mapCupmokaWooStatus('on-hold')).toBe('保留');
  });

  it('maps shipped and completed/delivered', () => {
    expect(mapCupmokaWooStatus('shipped')).toBe('Shipped');
    expect(mapCupmokaWooStatus('wc-shipped')).toBe('Shipped');
    expect(mapCupmokaWooStatus('completed')).toBe('Delivered');
    expect(mapCupmokaWooStatus('delivered')).toBe('Delivered');
  });

  it('maps cancelled and refunded', () => {
    expect(mapCupmokaWooStatus('cancelled')).toBe('取消');
    expect(mapCupmokaWooStatus('refunded')).toBe('已退費');
  });

  it('maps unknown Woo statuses to 處理中', () => {
    expect(mapCupmokaWooStatus('custom-status')).toBe('處理中');
  });
});

describe('isWooDraftOrder', () => {
  it('identifies Woo draft statuses', () => {
    expect(isWooDraftOrder('draft')).toBe(true);
    expect(isWooDraftOrder(' WC-DRAFT ')).toBe(true);
    expect(isWooDraftOrder('checkout-draft')).toBe(true);
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
