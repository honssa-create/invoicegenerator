import { afterEach, describe, expect, it, vi } from 'vitest';

describe('receipt storage mode', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('detects R2 as persistent', async () => {
    vi.stubEnv('R2_ENDPOINT', 'https://example.r2.cloudflarestorage.com');
    vi.stubEnv('R2_ACCESS_KEY_ID', 'key');
    vi.stubEnv('R2_SECRET_ACCESS_KEY', 'secret');
    vi.stubEnv('R2_BUCKET_NAME', 'bucket');
    vi.stubEnv('R2_PUBLIC_URL', 'https://cdn.example.com');
    const { getReceiptStorageMode, isReceiptStoragePersistent } = await import('./receipt-storage');
    expect(getReceiptStorageMode()).toBe('r2');
    expect(isReceiptStoragePersistent()).toBe(true);
  });

  it('detects Railway volume via DB_PATH', async () => {
    vi.stubEnv('DB_PATH', '/data/invoices.db');
    vi.stubEnv('R2_ENDPOINT', '');
    const { getReceiptStorageMode, isReceiptStoragePersistent } = await import('./receipt-storage');
    expect(getReceiptStorageMode()).toBe('volume');
    expect(isReceiptStoragePersistent()).toBe(true);
  });

  it('treats default data/ path as ephemeral', async () => {
    vi.stubEnv('DB_PATH', '');
    vi.stubEnv('R2_ENDPOINT', '');
    const { getReceiptStorageMode, shouldKeepRemoteUrlInsteadOfEphemeralSave } = await import(
      './receipt-storage'
    );
    expect(getReceiptStorageMode()).toBe('ephemeral');
    vi.stubEnv('NODE_ENV', 'production');
    expect(shouldKeepRemoteUrlInsteadOfEphemeralSave()).toBe(true);
  });
});
