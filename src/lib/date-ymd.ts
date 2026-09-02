export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function parseYmd(value: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!year || month < 1 || month > 12 || day < 1) return null;
  if (day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function formatYmd(year: number, month: number, day: number): string {
  const dim = daysInMonth(year, month);
  const d = Math.min(Math.max(1, day), dim);
  const m = Math.min(12, Math.max(1, month));
  return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function defaultYmdParts(value: string, now = new Date()): { year: number; month: number; day: number } {
  return parseYmd(value) || {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
  };
}
