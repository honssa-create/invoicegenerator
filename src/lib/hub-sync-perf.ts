import type { HubPlatform } from './hub';

type WooHubPlatform = Exclude<HubPlatform, 'manual' | 'quickbooks' | 'clickup'>;

/** Hub order statuses that are considered fully delivered — no further cron upserts when unchanged. */
export function hubTerminalStatuses(platform: WooHubPlatform): readonly string[] {
  switch (platform) {
    case 'nestiee':
      return ['shipped', 'completed'];
    case 'cupmoka':
      return ['Shipped', 'Delivered'];
    case 'honour':
    case 'honour_en':
      return ['已寄出 SENT'];
    default:
      return [];
  }
}

function isHubTerminalStatus(platform: WooHubPlatform, status: string): boolean {
  const s = String(status || '').trim();
  if (!s) return false;
  const terminals = hubTerminalStatuses(platform);
  if (terminals.includes(s)) return true;
  // Honour family also matches legacy SENT wording.
  if (platform === 'honour' || platform === 'honour_en') {
    return /\bSENT\b/i.test(s);
  }
  return false;
}

/**
 * Skip re-upserting orders that are already settled in Hub and still settled in Woo.
 * Allows one more sync when status advances (e.g. shipped → completed).
 */
export function shouldSkipSettledHubOrderSync(
  platform: WooHubPlatform,
  existingStatus: string | undefined,
  mappedStatus: string,
): boolean {
  if (!existingStatus) return false;
  if (!isHubTerminalStatus(platform, existingStatus)) return false;
  if (!isHubTerminalStatus(platform, mappedStatus)) return false;
  return existingStatus === mappedStatus;
}

/** Woo statuses to include in Nestiee created catch-up (excludes completed/delivered bulk re-fetch). */
export const NESTIEE_CATCHUP_WOO_STATUSES = [
  'pending',
  'processing',
  'on-hold',
  'shipped',
  'wc-shipped',
] as const;

export function nestieeCatchupIntervalHours(): number {
  const raw = Number(process.env.HUB_WOO_CATCHUP_INTERVAL_HOURS);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return 24;
}

export function catchupSyncStoreKey(platform: string): string {
  return `${platform}:created_catchup`;
}

export function catchupIntervalElapsed(lastCatchupAt: string | null, nowMs: number = Date.now()): boolean {
  if (!lastCatchupAt) return true;
  const parsed = Date.parse(lastCatchupAt.includes('T') ? lastCatchupAt : `${lastCatchupAt.replace(' ', 'T')}Z`);
  if (!Number.isFinite(parsed)) return true;
  const hours = nestieeCatchupIntervalHours();
  return nowMs - parsed >= hours * 60 * 60 * 1000;
}
