import { describe, expect, it } from 'vitest';
import { WOO_PLATFORM_KEYS, WOO_PLATFORM_LABELS } from './integration-settings';
import { WOO_PLATFORM_ORDER_TYPE, isBadgeOrderType } from './orders';
import { HUB_PLATFORMS, HUB_PLATFORM_PREFIX } from './hub';

describe('honour en platform wiring', () => {
  it('exposes honour_en in Woo + Hub platform lists', () => {
    expect(WOO_PLATFORM_KEYS).toContain('honour_en');
    expect(WOO_PLATFORM_LABELS.honour_en).toMatch(/Honour EN/i);
    expect(HUB_PLATFORMS).toContain('honour_en');
    expect(HUB_PLATFORM_PREFIX.honour_en).toBe('HEN');
  });

  it('maps honour_en Woo ingest to honour en order type + badge UI', () => {
    expect(WOO_PLATFORM_ORDER_TYPE.honour_en).toBe('honour en訂製');
    expect(WOO_PLATFORM_ORDER_TYPE.honour).toBe('honour訂製');
    expect(isBadgeOrderType('honour en訂製')).toBe(true);
    expect(isBadgeOrderType('honour訂製')).toBe(true);
  });
});
