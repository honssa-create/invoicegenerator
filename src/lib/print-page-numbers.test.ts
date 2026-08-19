import { describe, expect, it } from 'vitest';
import { countPrintPages, formatPrintPageLabel } from './print-page-numbers';

describe('formatPrintPageLabel', () => {
  it('uses Page X of Y', () => {
    expect(formatPrintPageLabel(1, 1)).toBe('Page 1 of 1');
    expect(formatPrintPageLabel(2, 5)).toBe('Page 2 of 5');
  });
});

describe('countPrintPages', () => {
  it('is at least one page', () => {
    expect(countPrintPages(0, 1000)).toBe(1);
    expect(countPrintPages(100, 0)).toBe(1);
    expect(countPrintPages(500, 1000)).toBe(1);
  });

  it('rounds up when content overflows a page', () => {
    expect(countPrintPages(1001, 1000)).toBe(2);
    expect(countPrintPages(2970, 1123)).toBe(3);
  });

  it('treats an exact page height as one sheet', () => {
    expect(countPrintPages(1123, 1123)).toBe(1);
    expect(countPrintPages(2246, 1123)).toBe(2);
  });
});
