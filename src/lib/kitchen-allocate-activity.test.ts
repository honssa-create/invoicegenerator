import { describe, expect, it } from 'vitest';
import { kitchenAllocateActivityMessage } from './kitchen-server';

describe('kitchenAllocateActivityMessage', () => {
  it('returns null when allocation was not triggered', () => {
    expect(
      kitchenAllocateActivityMessage({ ok: true, allocated: false, triggered: false }, 'woo_sync'),
    ).toBeNull();
  });

  it('logs shortage from woo sync', () => {
    expect(
      kitchenAllocateActivityMessage(
        {
          ok: false,
          shortages: [{ needKey: 'gift:red_silver', label: '紅色銀', need: 10, have: 2 }],
          triggered: true,
        },
        'woo_sync',
      ),
    ).toBe('Woo sync: kitchen stock short — could not auto-allocate (紅色銀: need 10, have 2)');
  });

  it('logs skip when no gift-box qty at ship time', () => {
    expect(
      kitchenAllocateActivityMessage(
        {
          ok: true,
          allocated: false,
          triggered: true,
          skipReason: 'no gift-box qty on order at ship time',
        },
        'woo_sync',
      ),
    ).toBe('Woo sync: kitchen auto-allocate skipped — no gift-box qty on order at ship time');
  });
});
