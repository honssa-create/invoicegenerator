import { describe, expect, it } from 'vitest';
import { expenseReceiptUrl, isStoredImageUrl } from './image-url';

describe('isStoredImageUrl', () => {
  it('detects http(s) URLs', () => {
    expect(isStoredImageUrl('https://cdn.example.com/a.jpg')).toBe(true);
    expect(isStoredImageUrl('http://x.test/b.png')).toBe(true);
    expect(isStoredImageUrl('abc.jpg')).toBe(false);
    expect(isStoredImageUrl(null)).toBe(false);
  });
});

describe('expenseReceiptUrl', () => {
  it('uses direct URL when path is already public (R2 / imported link)', () => {
    expect(
      expenseReceiptUrl({ id: 1, path: 'https://cdn.example.com/receipts/a.jpg' }, 5),
    ).toBe('https://cdn.example.com/receipts/a.jpg');
  });

  it('uses source_url when local file path is stored but remote fallback exists', () => {
    expect(
      expenseReceiptUrl(
        { id: 2, path: 'lost-on-redeploy.jpg', source_url: 'https://drive.google.com/file/d/abc/view' },
        5,
      ),
    ).toBe('https://drive.google.com/file/d/abc/view');
  });

  it('uses API route for local filenames without source_url', () => {
    expect(expenseReceiptUrl({ id: 3, path: 'abc.jpg' }, 5)).toBe('/api/receipts/3');
  });

  it('uses legacy expense receipt route when receipt id is 0', () => {
    expect(expenseReceiptUrl({ id: 0, path: 'abc.jpg' }, 9)).toBe('/api/expenses/9/receipt');
  });
});
