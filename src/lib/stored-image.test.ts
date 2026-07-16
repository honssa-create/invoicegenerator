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

  it('streams a local file when present', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'receipt-test-'));
    vi.stubEnv('RECEIPTS_DIR', dir);
    const filename = 'sample.jpg';
    fs.writeFileSync(path.join(dir, filename), Buffer.from([0xff, 0xd8, 0xff, 0x00]));

    vi.resetModules();
    const { imageResponseForStoredPath: serve } = await import('./stored-image');
    const res = await serve(filename);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
  });

  it('returns 404 when local file and remote fallbacks are missing', async () => {
    const res = await imageResponseForStoredPath('missing-file.jpg');
    expect(res.status).toBe(404);
  });

  it('falls back to source_url when the primary local file is missing', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: { get: () => 'image/png' },
      arrayBuffer: async () => Uint8Array.from([0x89, 0x50, 0x4e, 0x47]).buffer,
    }));
    vi.stubGlobal('fetch', fetchMock);

    vi.resetModules();
    const { imageResponseForStoredPath: serve } = await import('./stored-image');
    const res = await serve('missing-file.jpg', 'https://cdn.example.com/fallback.png');
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://cdn.example.com/fallback.png',
      expect.objectContaining({ redirect: 'follow' }),
    );
  });
});
