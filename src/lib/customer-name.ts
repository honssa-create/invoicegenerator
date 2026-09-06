/** Split on dash separators and drop segments that contain any digit. */
export function normalizeCustomerName(name: string | null | undefined): string {
  const raw = String(name ?? '').trim();
  if (!raw) return '';

  const parts = raw
    .split(/[-–—]/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length <= 1) return raw;

  const kept = parts.filter((part) => !/\d/.test(part));
  if (kept.length === 0) return raw;
  return kept.join(' - ');
}
