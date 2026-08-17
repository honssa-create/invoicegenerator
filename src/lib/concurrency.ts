/** Shared optimistic-concurrency helpers for multi-user edits. */

export function timestampsMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (a == null || b == null) return false;
  const left = String(a).trim();
  const right = String(b).trim();
  if (left === right) return true;
  const ta = Date.parse(left.includes('T') ? left : left.replace(' ', 'T') + 'Z');
  const tb = Date.parse(right.includes('T') ? right : right.replace(' ', 'T') + 'Z');
  if (Number.isFinite(ta) && Number.isFinite(tb)) {
    return Math.abs(ta - tb) < 1500;
  }
  return false;
}

export const CONFLICT_MESSAGE =
  'This record was updated by someone else. Reload to see the latest version, then try again.';

export const CONFLICT_MESSAGE_ZH =
  '此紀錄已被其他人更新。請重新載入最新版本後再試。';
