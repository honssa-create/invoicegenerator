/** Shared list-query helpers. Client-safe. */

export function clampPageLimit(raw: unknown, fallback: number, max = 200): number {
  if (raw == null || raw === '') return fallback;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(n)));
}

export function clampPageOffset(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

export function isoDateParam(raw: string | null | undefined): string {
  const s = (raw || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

export function yearMonthParam(raw: string | null | undefined): string {
  const s = (raw || '').trim();
  return /^\d{4}-\d{2}$/.test(s) ? s : '';
}

/**
 * ILIKE contains-pattern. Call sites must use `ESCAPE '!'`.
 * `!`, `%`, and `_` in the user text are escaped.
 */
export function containsLike(raw: string): string {
  const escaped = raw.trim().replace(/[!%_]/g, (ch) => `!${ch}`);
  return `%${escaped}%`;
}
