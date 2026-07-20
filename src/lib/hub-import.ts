/** Date range options for manual hub imports. */

export interface HubImportOptions {
  dateFrom?: string;
  dateTo?: string;
}

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
