import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  deleteReplacedStoredFile,
  deleteStoredFile,
  deleteStoredPathsExcept,
  extractStoredPathsFromTrashPayload,
  isManagedStoredPath,
} from './stored-file-cleanup';

describe('isManagedStoredPath', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('accepts bare local filenames and our R2 URLs', () => {
    vi.stubEnv('R2_PUBLIC_URL', 'https://pub-abc.r2.dev');
    expect(isManagedStoredPath('abc.jpg')).toBe(true);
    expect(isManagedStoredPath('https://pub-abc.r2.dev/receipts/abc.jpg')).toBe(true);
  });

  it('rejects third-party URLs and unsafe paths', () => {
    expect(isManagedStoredPath('https://drive.google.com/file/d/abc/view')).toBe(false);
    expect(isManagedStoredPath('../etc/passwd')).toBe(false);
    expect(isManagedStoredPath(null)).toBe(false);
  });
});

describe('canonicalStorageKey', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('maps R2 URLs to object keys and local files to local:* keys', async () => {
    vi.stubEnv('R2_PUBLIC_URL', 'https://pub-abc.r2.dev');
    const { canonicalStorageKey } = await import('./stored-file-cleanup');
    expect(canonicalStorageKey('https://pub-abc.r2.dev/receipts/a.jpg')).toBe('receipts/a.jpg');
    expect(canonicalStorageKey('a.jpg')).toBe('local:a.jpg');
  });
});

describe('deleteStoredFile', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('deletes a local receipt file', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cleanup-test-'));
    vi.stubEnv('RECEIPTS_DIR', dir);
    const filename = 'sample.jpg';
    fs.writeFileSync(path.join(dir, filename), Buffer.from('x'));

    expect(await deleteStoredFile(filename)).toBe(true);
    expect(fs.existsSync(path.join(dir, filename))).toBe(false);
  });

  it('ignores third-party URLs', async () => {
    expect(await deleteStoredFile('https://example.com/a.jpg')).toBe(false);
  });
});

describe('deleteReplacedStoredFile', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('deletes the old path when it changes', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cleanup-replace-'));
    vi.stubEnv('RECEIPTS_DIR', dir);
    fs.writeFileSync(path.join(dir, 'old.jpg'), Buffer.from('old'));
    fs.writeFileSync(path.join(dir, 'new.jpg'), Buffer.from('new'));

    await deleteReplacedStoredFile('old.jpg', 'new.jpg');
    expect(fs.existsSync(path.join(dir, 'old.jpg'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'new.jpg'))).toBe(true);
  });
});

describe('deleteStoredPathsExcept', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('deletes removed paths but keeps retained ones', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cleanup-except-'));
    vi.stubEnv('RECEIPTS_DIR', dir);
    fs.writeFileSync(path.join(dir, 'keep.jpg'), Buffer.from('keep'));
    fs.writeFileSync(path.join(dir, 'drop.jpg'), Buffer.from('drop'));

    await deleteStoredPathsExcept(['keep.jpg', 'drop.jpg'], ['keep.jpg']);
    expect(fs.existsSync(path.join(dir, 'keep.jpg'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'drop.jpg'))).toBe(false);
  });
});

describe('extractStoredPathsFromTrashPayload', () => {
  it('collects expense, order, and attachment paths', () => {
    const paths = extractStoredPathsFromTrashPayload('expense', {
      expense: { receipt_path: 'legacy.jpg' },
      receipts: [{ path: 'a.jpg' }, { path: 'https://remote.test/x.jpg' }],
    });
    expect(paths).toEqual(['legacy.jpg', 'a.jpg']);

    const orderPaths = extractStoredPathsFromTrashPayload('order', {
      order: { fields_json: JSON.stringify({ payment_receipt_path: 'pay1.jpg' }) },
      files: [{ path: 'proof.jpg' }],
    });
    expect(orderPaths).toEqual(['pay1.jpg', 'proof.jpg']);
  });
});
