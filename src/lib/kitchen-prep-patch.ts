import { PREP_STATUSES, type PrepStatus } from '@/lib/kitchen-prep';

/** True when the client only advances workflow status (list/detail action buttons). */
export function isKitchenPrepStatusOnlyPatch(body: Record<string, unknown>): boolean {
  const keys = Object.keys(body).filter((k) => body[k] !== undefined);
  if (keys.length !== 1 || keys[0] !== 'status') return false;
  const status = body.status;
  return typeof status === 'string' && (PREP_STATUSES as readonly string[]).includes(status);
}

export function parsePrepStatusPatch(body: Record<string, unknown>): PrepStatus | null {
  const status = body.status;
  if (typeof status !== 'string' || !(PREP_STATUSES as readonly string[]).includes(status)) {
    return null;
  }
  return status as PrepStatus;
}
