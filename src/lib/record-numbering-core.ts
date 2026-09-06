export type GlobalRecordType = 'order' | 'quotation' | 'invoice';

export const MAX_RECORD_SERIAL: Record<GlobalRecordType, number> = {
  order: 9_999_999,
  quotation: 99_999_999,
  invoice: 99_999_999,
};

export const ORDER_REFERENCE_RE = /^ORD-\d{7}$/;
export const DOCUMENT_NUMBER_RE = /^\d{8}$/;

export interface LegacyNumberRow {
  id: number;
  value: string;
  created_at?: string;
}

export function parseNumericDocumentNumber(value: string | null | undefined): number | null {
  const normalized = String(value || '').trim();
  if (!/^\d+$/.test(normalized)) return null;
  const serial = Number(normalized);
  return Number.isSafeInteger(serial) && serial >= 1 && serial <= MAX_RECORD_SERIAL.invoice
    ? serial
    : null;
}

export function formatOrderReference(serial: number): string {
  if (!Number.isSafeInteger(serial) || serial < 1 || serial > MAX_RECORD_SERIAL.order) {
    throw new Error('Order reference sequence is out of range');
  }
  return `ORD-${String(serial).padStart(7, '0')}`;
}

export function formatDocumentNumber(serial: number): string {
  if (!Number.isSafeInteger(serial) || serial < 1 || serial > MAX_RECORD_SERIAL.invoice) {
    throw new Error('Document number sequence is out of range');
  }
  return String(serial).padStart(8, '0');
}

export const RECORD_TYPE_DISPLAY_NAME: Record<GlobalRecordType, string> = {
  order: 'Order',
  quotation: 'Quotation',
  invoice: 'Invoice',
};

/** Prefix the type name for UI display. Stored values stay unprefixed. */
export function displayRecordNumber(
  recordType: GlobalRecordType,
  value: string | null | undefined,
): string {
  const number = String(value || '').trim();
  if (!number) return '';
  const name = RECORD_TYPE_DISPLAY_NAME[recordType];
  const prefix = `${name} `;
  if (number.toLowerCase().startsWith(prefix.toLowerCase())) return number;
  return `${prefix}${number}`;
}

export function displayInvoiceNumber(value: string | null | undefined): string {
  return displayRecordNumber('invoice', value);
}

export function displayQuotationNumber(value: string | null | undefined): string {
  return displayRecordNumber('quotation', value);
}

export function displayOrderNumber(value: string | null | undefined): string {
  return displayRecordNumber('order', value);
}

/**
 * Preserve the first occurrence of each valid numeric legacy value. Collisions
 * and non-numeric values are assigned monotonically above the legacy maximum.
 */
export function assignLegacyDocumentNumbers(rows: LegacyNumberRow[]): Map<number, number> {
  const assigned = new Map<number, number>();
  const used = new Set<number>();
  const deferred: LegacyNumberRow[] = [];
  let max = 0;

  for (const row of rows) {
    const serial = parseNumericDocumentNumber(row.value);
    if (serial != null && !used.has(serial)) {
      assigned.set(row.id, serial);
      used.add(serial);
      max = Math.max(max, serial);
    } else {
      deferred.push(row);
    }
  }

  let next = max + 1;
  for (const row of deferred) {
    while (used.has(next)) next += 1;
    if (next > MAX_RECORD_SERIAL.invoice) {
      throw new Error('Eight-digit document number range is exhausted');
    }
    assigned.set(row.id, next);
    used.add(next);
    next += 1;
  }
  return assigned;
}
