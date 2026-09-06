import { afterEach, describe, expect, it, vi } from 'vitest';

describe('r2KeyFromPublicUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('extracts object key from the configured public base URL', async () => {
    vi.stubEnv('R2_PUBLIC_URL', 'https://pub-81edcc80a8e5424888a03e9a3dd440d3.r2.dev');
    const { r2KeyFromPublicUrl } = await import('./r2');
    expect(
      r2KeyFromPublicUrl(
        'https://pub-81edcc80a8e5424888a03e9a3dd440d3.r2.dev/receipts/1234-abc-receipt.jpg',
      ),
    ).toBe('receipts/1234-abc-receipt.jpg');
  });

  it('returns null for unrelated URLs', async () => {
    vi.stubEnv('R2_PUBLIC_URL', 'https://pub-abc.r2.dev');
    const { r2KeyFromPublicUrl } = await import('./r2');
    expect(r2KeyFromPublicUrl('https://other.example.com/a.jpg')).toBeNull();
  });
});
