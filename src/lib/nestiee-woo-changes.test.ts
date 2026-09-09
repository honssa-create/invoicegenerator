import { describe, expect, it } from 'vitest';
import {
  detectNestieeWooPendingChangesFromSync,
  hasNestieeWooPendingChanges,
  mergeNestieeWooPendingChanges,
  orderMatchesNestieeModifiedScope,
  parseNestieeWooPendingChanges,
} from './nestiee-woo-changes';

describe('detectNestieeWooPendingChangesFromSync', () => {
  it('detects delivery date, address, and notes changes', () => {
    const changes = detectNestieeWooPendingChangesFromSync({
      previousFields: { client_delivery_date: '2026-09-08' },
      previousShippingAddress: 'Old address',
      previousNotes: 'Old note',
      nextFields: { client_delivery_date: '2026-09-10' },
      nextShippingAddress: 'New address',
      incomingCustomerNote: 'New note',
    });
    expect(changes.map((c) => c.key).sort()).toEqual(['address', 'delivery_date', 'notes']);
  });

  it('ignores empty incoming note', () => {
    const changes = detectNestieeWooPendingChangesFromSync({
      previousFields: {},
      previousShippingAddress: '',
      previousNotes: 'Keep',
      nextFields: {},
      nextShippingAddress: '',
      incomingCustomerNote: '',
    });
    expect(changes).toEqual([]);
  });
});

describe('orderMatchesNestieeModifiedScope', () => {
  it('matches processing orders with pending changes only', () => {
    expect(
      orderMatchesNestieeModifiedScope({
        status: 'processing',
        fields: {
          woo_pending_changes: [{ key: 'delivery_date', before: 'a', after: 'b' }],
        },
      }),
    ).toBe(true);
    expect(orderMatchesNestieeModifiedScope({ status: 'completed', fields: { woo_pending_changes: [] } })).toBe(
      false,
    );
    expect(orderMatchesNestieeModifiedScope({ status: 'processing', fields: {} })).toBe(false);
  });
});

describe('mergeNestieeWooPendingChanges', () => {
  it('replaces same key with latest', () => {
    const merged = mergeNestieeWooPendingChanges(
      [{ key: 'delivery_date', before: 'a', after: 'b' }],
      [{ key: 'delivery_date', before: 'a', after: 'c' }, { key: 'address', before: 'x', after: 'y' }],
    );
    expect(merged).toHaveLength(2);
    expect(merged.find((c) => c.key === 'delivery_date')?.after).toBe('c');
  });
});

describe('parseNestieeWooPendingChanges', () => {
  it('parses stored array', () => {
    expect(
      hasNestieeWooPendingChanges({
        woo_pending_changes: [{ key: 'notes', before: 'a', after: 'b' }],
      }),
    ).toBe(true);
    expect(parseNestieeWooPendingChanges({ woo_pending_changes: [{ key: 'bad', before: '', after: '' }] })).toEqual(
      [],
    );
  });
});
