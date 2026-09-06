import { describe, expect, it } from 'vitest';
import { sanitizePdfBasename } from './download-print-pdf';

describe('sanitizePdfBasename', () => {
  it('keeps invoice numbers and replaces spaces', () => {
    expect(sanitizePdfBasename('Invoice 00000001')).toBe('Invoice_00000001');
  });

  it('falls back when empty', () => {
    expect(sanitizePdfBasename('   ')).toBe('document');
  });
});
