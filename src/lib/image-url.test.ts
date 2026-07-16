import { describe, expect, it } from 'vitest';
import {
  expenseReceiptUrl,
  formReceiptPreviewUrl,
  isStoredImageUrl,
  scanPreviewReceiptUrl,
} from './image-url';

describe('isStoredImageUrl', () => {
  it('detects http(s) URLs', () => {
    expect(isStoredImageUrl('https://cdn.example.com/a.jpg')).toBe(true);
    expect(isStoredImageUrl('http://x.test/b.png')).toBe(true);
    expect(isStoredImageUrl('abc.jpg')).toBe(false);
    expect(isStoredImageUrl(null)).toBe(false);
  });
});

describe('formReceiptPreviewUrl', () => {
  it('prefers the local blob URL over a stored R2 URL', () => {
    expect(
      formReceiptPreviewUrl('https://cdn.example.com/receipts/a.jpg', 'blob:http://localhost/abc'),
    ).toBe('blob:http://localhost/abc');
  });

  it('uses scan-preview for bare filenames when no blob is available', () => {
    expect(formReceiptPreviewUrl('ad8d63f0-4f76-47c5-a3d1-6f25bef3b499.jpg')).toBe(
      '/api/expenses/scan-preview/ad8d63f0-4f76-47c5-a3d1-6f25bef3b499.jpg',
    );
  });

  it('uses direct URL when path is already public and blob is absent', () => {
    expect(formReceiptPreviewUrl('https://cdn.example.com/a.jpg')).toBe('https://cdn.example.com/a.jpg');
  });
});

describe('scanPreviewReceiptUrl', () => {
  it('rejects paths with directories or http URLs', () => {
    expect(scanPreviewReceiptUrl('https://cdn.test/a.jpg')).toBeNull();
    expect(scanPreviewReceiptUrl('../etc/passwd')).toBeNull();
  });
});

describe('expenseReceiptUrl', () => {
  it('uses direct URL when path is already public (R2 / imported link)', () => {
    expect(
      expenseReceiptUrl({ id: 1, path: 'https://cdn.example.com/receipts/a.jpg' }, 5),
    ).toBe('https://cdn.example.com/receipts/a.jpg');
  });

  it('uses API route for downloaded local files even when source_url is set', () => {
    expect(
      expenseReceiptUrl(
        { id: 2, path: 'a8d5d09b-c11b-415b-bd59-8bc545fa20ca.png', source_url: 'https://drive.google.com/file/d/abc/view' },
        5,
      ),
    ).toBe('/api/receipts/2');
  });

  it('uses API route for local filenames without source_url', () => {
    expect(expenseReceiptUrl({ id: 3, path: 'abc.jpg' }, 5)).toBe('/api/receipts/3');
  });

  it('uses legacy expense receipt route when receipt id is 0', () => {
    expect(expenseReceiptUrl({ id: 0, path: 'abc.jpg' }, 9)).toBe('/api/expenses/9/receipt');
  });
});
