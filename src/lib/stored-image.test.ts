import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { imageResponseForStoredPath } from './stored-image';

describe('imageResponseForStoredPath', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('redirects when stored path is already a public URL', () => {
    const res = imageResponseForStoredPath('https://cdn.example.com/a.jpg');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://cdn.example.com/a.jpg');
  });

  it('falls back to source_url when local file is missing', () => {
    const res = imageResponseForStoredPath('missing-file.jpg', 'https://cdn.example.com/fallback.jpg');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://cdn.example.com/fallback.jpg');
  });

  it('streams a local file when present', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'receipt-test-'));
    vi.stubEnv('RECEIPTS_DIR', dir);
    const filename = 'sample.jpg';
    fs.writeFileSync(path.join(dir, filename), Buffer.from([0xff, 0xd8, 0xff, 0x00]));

    vi.resetModules();
    const { imageResponseForStoredPath: serve } = await import('./stored-image');
    const res = serve(filename);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
  });
});
