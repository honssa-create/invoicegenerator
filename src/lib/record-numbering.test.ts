import { describe, expect, it } from 'vitest';
import {
  DOCUMENT_NUMBER_RE,
  ORDER_REFERENCE_RE,
  assignLegacyDocumentNumbers,
  displayInvoiceNumber,
  displayOrderNumber,
  displayQuotationNumber,
  formatDocumentNumber,
  formatOrderReference,
  parseNumericDocumentNumber,
} from './record-numbering-core';

describe('record numbering', () => {
  it('formats the first and last supported order references', () => {
    expect(formatOrderReference(1)).toBe('ORD-0000001');
    expect(formatOrderReference(9_999_999)).toBe('ORD-9999999');
    expect(ORDER_REFERENCE_RE.test('ORD-0042187')).toBe(true);
  });

  it('formats fixed-width quotation and invoice numbers', () => {
    expect(formatDocumentNumber(1)).toBe('00000001');
    expect(formatDocumentNumber(1_001_001)).toBe('01001001');
    expect(DOCUMENT_NUMBER_RE.test('01001001')).toBe(true);
  });

  it('prefixes type names when displaying record numbers', () => {
    expect(displayInvoiceNumber('00000001')).toBe('Invoice 00000001');
    expect(displayQuotationNumber('00000001')).toBe('Quotation 00000001');
    expect(displayOrderNumber('H3326')).toBe('Order H3326');
    expect(displayInvoiceNumber('Invoice 00000009')).toBe('Invoice 00000009');
    expect(displayQuotationNumber('')).toBe('');
  });

  it('rejects invalid and exhausted serials', () => {
    expect(() => formatOrderReference(0)).toThrow();
    expect(() => formatOrderReference(10_000_000)).toThrow();
    expect(() => formatDocumentNumber(100_000_000)).toThrow();
    expect(parseNumericDocumentNumber('QB-1001')).toBeNull();
  });

  it('preserves numeric values and resolves normalized collisions deterministically', () => {
    const assigned = assignLegacyDocumentNumbers([
      { id: 1, value: '1038' },
      { id: 2, value: '00001038' },
      { id: 3, value: 'QB-1001' },
      { id: 4, value: '1000' },
    ]);

    expect(assigned.get(1)).toBe(1038);
    expect(assigned.get(4)).toBe(1000);
    expect(assigned.get(2)).toBe(1039);
    expect(assigned.get(3)).toBe(1040);
  });
});
