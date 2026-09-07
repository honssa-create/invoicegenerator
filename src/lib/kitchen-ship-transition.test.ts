import { describe, expect, it } from 'vitest';
import { tryAllocateKitchenOnShipTransition } from './kitchen-server';
import { NESTIEE_ORDER_TYPE } from './orders';

describe('tryAllocateKitchenOnShipTransition', () => {
  it('skips when order was already shipped', async () => {
    const result = await tryAllocateKitchenOnShipTransition(
      1,
      1,
      99,
      { status: 'shipped', fields: { order_type: NESTIEE_ORDER_TYPE } },
      { status: 'completed', fields: { order_type: NESTIEE_ORDER_TYPE } },
    );
    expect(result).toEqual({ ok: true, allocated: false, triggered: false });
  });

  it('skips when next status is not shipped', async () => {
    const result = await tryAllocateKitchenOnShipTransition(
      1,
      1,
      99,
      { status: 'processing', fields: { order_type: NESTIEE_ORDER_TYPE } },
      { status: 'pending payment', fields: { order_type: NESTIEE_ORDER_TYPE } },
    );
    expect(result).toEqual({ ok: true, allocated: false, triggered: false });
  });
});
