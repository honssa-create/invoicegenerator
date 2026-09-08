export interface HubImportDateRange {
  dateFrom: string;
  dateTo: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function parseHubImportDateRange(input: {
  date_from?: string | null;
  date_to?: string | null;
}): { ok: true; range: HubImportDateRange } | { ok: false; error: string } {
  const dateFrom = input.date_from?.trim() || '';
  const dateTo = input.date_to?.trim() || '';

  if (!dateFrom || !dateTo) {
    return {
      ok: false,
      error: 'Import date range is required — choose a From and To date before importing.',
    };
  }
  if (!isIsoDate(dateFrom) || !isIsoDate(dateTo)) {
    return { ok: false, error: 'Import dates must use YYYY-MM-DD format.' };
  }
  if (dateFrom > dateTo) {
    return { ok: false, error: 'Import From date cannot be after To date.' };
  }

  return { ok: true, range: { dateFrom, dateTo } };
}

/** WooCommerce `after` / `before` bounds for order date_created (Hong Kong time). */
export function wooOrderCreatedBounds(range: HubImportDateRange): { after: string; before: string } {
  return {
    after: `${range.dateFrom}T00:00:00+08:00`,
    before: `${range.dateTo}T23:59:59+08:00`,
  };
}

export function orderCreatedInRange(createdAt: string, range: HubImportDateRange): boolean {
  const day = createdAt.slice(0, 10);
  return day >= range.dateFrom && day <= range.dateTo;
}

/** Shift an ISO / SQL sync timestamp back for modified_after overlap. */
export function subtractDaysFromIsoTimestamp(timestamp: string, days: number): string {
  if (days <= 0) return timestamp;
  const normalized = timestamp.includes('T') ? timestamp : `${timestamp.replace(' ', 'T')}Z`;
  const parsed = Date.parse(normalized);
  if (Number.isNaN(parsed)) return timestamp;
  return new Date(parsed - days * 24 * 60 * 60 * 1000).toISOString();
}

/** Rolling inclusive calendar-day window ending today (UTC dates). */
export function rollingHubImportDateRange(days: number): HubImportDateRange {
  const safeDays = Math.max(1, Math.floor(days));
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - (safeDays - 1));
  return {
    dateFrom: from.toISOString().slice(0, 10),
    dateTo: to.toISOString().slice(0, 10),
  };
}
