import { describe, expect, it } from 'vitest';
import {
  catchupIntervalElapsed,
  catchupSyncStoreKey,
  hubTerminalStatuses,
  shouldSkipSettledHubOrderSync,
} from './hub-sync-perf';

describe('shouldSkipSettledHubOrderSync', () => {
  it('skips nestiee orders already completed with no status change', () => {
    expect(shouldSkipSettledHubOrderSync('nestiee', 'completed', 'completed')).toBe(true);
    expect(shouldSkipSettledHubOrderSync('nestiee', 'shipped', 'shipped')).toBe(true);
  });

  it('still syncs when nestiee advances shipped → completed', () => {
    expect(shouldSkipSettledHubOrderSync('nestiee', 'shipped', 'completed')).toBe(false);
  });

  it('still syncs processing nestiee orders', () => {
    expect(shouldSkipSettledHubOrderSync('nestiee', 'processing', 'processing')).toBe(false);
    expect(shouldSkipSettledHubOrderSync('nestiee', undefined, 'completed')).toBe(false);
  });

  it('skips honour orders already SENT', () => {
    expect(shouldSkipSettledHubOrderSync('honour', '已寄出 SENT', '已寄出 SENT')).toBe(true);
    expect(shouldSkipSettledHubOrderSync('honour', 'IN PROGRESS 安排中', '已寄出 SENT')).toBe(false);
  });

  it('skips cupmoka delivered orders', () => {
    expect(shouldSkipSettledHubOrderSync('cupmoka', 'Delivered', 'Delivered')).toBe(true);
    expect(shouldSkipSettledHubOrderSync('cupmoka', 'Shipped', 'Delivered')).toBe(false);
  });
});

describe('catchupIntervalElapsed', () => {
  const now = Date.parse('2026-09-08T12:00:00Z');

  it('runs catchup when never synced before', () => {
    expect(catchupIntervalElapsed(null, now)).toBe(true);
  });

  it('waits 24h between nestiee created catchups', () => {
    expect(catchupIntervalElapsed('2026-09-08T11:00:00Z', now)).toBe(false);
    expect(catchupIntervalElapsed('2026-09-07T11:00:00Z', now)).toBe(true);
  });
});

describe('hubTerminalStatuses', () => {
  it('lists nestiee shipped and completed', () => {
    expect(hubTerminalStatuses('nestiee')).toEqual(['shipped', 'completed']);
  });

  it('uses dedicated catchup sync key per platform', () => {
    expect(catchupSyncStoreKey('nestiee')).toBe('nestiee:created_catchup');
  });
});
