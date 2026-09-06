import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  findOrphanReceiptCandidates,
  type StoredReceiptCandidate,
} from './orphan-receipt-sweep';

describe('orphan receipt sweep', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('lists local receipt files as candidates', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orphan-list-'));
    vi.stubEnv('RECEIPTS_DIR', dir);
    fs.writeFileSync(path.join(dir, 'old.jpg'), Buffer.from('old'));
    fs.writeFileSync(path.join(dir, 'keep.png'), Buffer.from('keep'));

    vi.resetModules();
    const { listStoredReceiptCandidates } = await import('./orphan-receipt-sweep');
    const candidates = await listStoredReceiptCandidates();
    expect(candidates.map((c) => c.path).sort()).toEqual(['keep.png', 'old.jpg']);
  });

  it('finds only unreferenced files older than the grace period', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orphan-sweep-'));
    vi.stubEnv('RECEIPTS_DIR', dir);

    const orphanName = 'orphan.jpg';
    const keepName = 'saved.jpg';
    const freshName = 'fresh.jpg';
    const orphanPath = path.join(dir, orphanName);
    const keepPath = path.join(dir, keepName);
    const freshPath = path.join(dir, freshName);
    fs.writeFileSync(orphanPath, Buffer.from('orphan'));
    fs.writeFileSync(keepPath, Buffer.from('keep'));
    fs.writeFileSync(freshPath, Buffer.from('fresh'));

    const oldTime = Date.now() - 72 * 60 * 60 * 1000;
    fs.utimesSync(orphanPath, oldTime / 1000, oldTime / 1000);
    fs.utimesSync(keepPath, oldTime / 1000, oldTime / 1000);

    vi.resetModules();
    const { listStoredReceiptCandidates } = await import('./orphan-receipt-sweep');
    const candidates = await listStoredReceiptCandidates();
    const referenced = new Set([`local:${keepName}`]);
    const orphans = findOrphanReceiptCandidates(candidates, referenced, 48);
    expect(orphans.map((o) => o.path)).toEqual([orphanName]);

    const { deleteStoredFile } = await import('./stored-file-cleanup');
    expect(await deleteStoredFile(orphanName)).toBe(true);
    expect(fs.existsSync(orphanPath)).toBe(false);
    expect(fs.existsSync(keepPath)).toBe(true);
    expect(fs.existsSync(freshPath)).toBe(true);
  });

  it('supports dry-run style inspection via findOrphanReceiptCandidates', () => {
    const candidates: StoredReceiptCandidate[] = [
      {
        storageKey: 'local:old.jpg',
        path: 'old.jpg',
        modifiedAt: new Date(Date.now() - 72 * 3600_000),
        ageHours: 72,
      },
      {
        storageKey: 'local:recent.jpg',
        path: 'recent.jpg',
        modifiedAt: new Date(),
        ageHours: 0.1,
      },
    ];
    const referenced = new Set(['local:linked.jpg']);
    expect(findOrphanReceiptCandidates(candidates, referenced, 48)).toEqual([candidates[0]]);
  });
});
