import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { getPublicOrigin } from './request-origin';

describe('getPublicOrigin', () => {
  const originalAppUrl = process.env.APP_URL;

  beforeEach(() => {
    delete process.env.APP_URL;
  });

  afterEach(() => {
    if (originalAppUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = originalAppUrl;
  });

  it('prefers APP_URL when set', () => {
    process.env.APP_URL = 'https://tender-love-production-f7f4.up.railway.app/';
    const request = new Request('http://localhost:8080/api/integrations/quickbooks/callback');
    expect(getPublicOrigin(request)).toBe('https://tender-love-production-f7f4.up.railway.app');
  });

  it('uses x-forwarded headers when APP_URL is unset', () => {
    const request = new Request('http://localhost:8080/api/integrations/quickbooks/callback', {
      headers: {
        'x-forwarded-host': 'tender-love-production-f7f4.up.railway.app',
        'x-forwarded-proto': 'https',
      },
    });
    expect(getPublicOrigin(request)).toBe('https://tender-love-production-f7f4.up.railway.app');
  });

  it('derives origin from saved QuickBooks redirect URI', () => {
    const request = new Request('http://localhost:8080/api/integrations/quickbooks/callback');
    expect(
      getPublicOrigin(request, {
        savedRedirectUri:
          'https://tender-love-production-f7f4.up.railway.app/api/integrations/quickbooks/callback',
      }),
    ).toBe('https://tender-love-production-f7f4.up.railway.app');
  });

  it('falls back to request URL origin for local dev', () => {
    const request = new Request('http://localhost:3000/api/integrations/quickbooks/callback');
    expect(getPublicOrigin(request)).toBe('http://localhost:3000');
  });
});
