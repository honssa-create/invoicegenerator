import fs from 'fs';
import path from 'path';
import db from './db';
import {
  canonicalStorageKey,
  deleteStoredFile,
  extractStoredPathsFromTrashPayload,
  isManagedStoredPath,
  orderPaymentReceiptPaths,
} from './stored-file-cleanup';
import { resolveReceiptsDir } from './receipt';
import { isR2Configured, listR2Objects, publicObjectUrl } from './r2';
import type { TrashEntityType } from './trash-constants';

export const DEFAULT_ORPHAN_MIN_AGE_HOURS = 48;
export const ORPHAN_SWEEP_SAMPLE_LIMIT = 50;

export interface StoredReceiptCandidate {
  storageKey: string;
  path: string;
  modifiedAt: Date;
  ageHours: number;
}

export interface OrphanReceiptSweepResult {
  dry_run: boolean;
  min_age_hours: number;
  storage: 'r2' | 'local';
  scanned: number;
  referenced: number;
  orphans: number;
  deleted: number;
  samples: StoredReceiptCandidate[];
}

function addReferencedKey(keys: Set<string>, value: unknown): void {
  if (typeof value !== 'string') return;
  const key = canonicalStorageKey(value);
  if (key) keys.add(key);
}

async function rowsWithPath(sql: string): Promise<string[]> {
  const rows = (await db.prepare(sql).all()) as Array<{ path: string | null }>;
  return rows.map((row) => row.path).filter((p): p is string => Boolean(p?.trim()));
}

export async function collectReferencedStorageKeys(): Promise<Set<string>> {
  const keys = new Set<string>();

  const unionQueries = [
    `SELECT receipt_path AS path FROM expenses WHERE receipt_path IS NOT NULL AND btrim(receipt_path) <> ''`,
    `SELECT path FROM expense_receipts WHERE path IS NOT NULL AND btrim(path) <> ''`,
    `SELECT path FROM order_files WHERE path IS NOT NULL AND btrim(path) <> ''`,
    `SELECT path FROM invoice_files WHERE path IS NOT NULL AND btrim(path) <> ''`,
    `SELECT path FROM quotation_files WHERE path IS NOT NULL AND btrim(path) <> ''`,
    `SELECT receipt_path AS path FROM other_income WHERE receipt_path IS NOT NULL AND btrim(receipt_path) <> ''`,
    `SELECT photo_path AS path FROM inbound_shipments WHERE photo_path IS NOT NULL AND btrim(photo_path) <> ''`,
    `SELECT photo_path AS path FROM utility_meter_round_items WHERE photo_path IS NOT NULL AND btrim(photo_path) <> ''`,
    `SELECT receipt_image_path AS path FROM rental_records WHERE receipt_image_path IS NOT NULL AND btrim(receipt_image_path) <> ''`,
    `SELECT receipt_image_path AS path FROM rental_payments WHERE receipt_image_path IS NOT NULL AND btrim(receipt_image_path) <> ''`,
    `SELECT image_path AS path FROM rental_payment_receipts WHERE image_path IS NOT NULL AND btrim(image_path) <> ''`,
    `SELECT file_path AS path FROM rental_lease_documents WHERE file_path IS NOT NULL AND btrim(file_path) <> ''`,
    `SELECT receipt_path AS path FROM reconciliation_records WHERE receipt_path IS NOT NULL AND btrim(receipt_path) <> ''`,
    `SELECT icon_path AS path FROM stock_items WHERE icon_path IS NOT NULL AND btrim(icon_path) <> ''`,
  ];

  for (const sql of unionQueries) {
    for (const storedPath of await rowsWithPath(sql)) {
      addReferencedKey(keys, storedPath);
    }
  }

  const orderRows = (await db
    .prepare(`SELECT fields_json FROM orders WHERE fields_json IS NOT NULL AND btrim(fields_json) <> ''`)
    .all()) as Array<{ fields_json: string }>;
  for (const row of orderRows) {
    try {
      const fields = JSON.parse(row.fields_json) as Record<string, unknown>;
      for (const storedPath of orderPaymentReceiptPaths(fields)) {
        addReferencedKey(keys, storedPath);
      }
    } catch {
      // Ignore malformed order JSON blobs.
    }
  }

  const trashRows = (await db
    .prepare(`SELECT entity_type, payload FROM deleted_records`)
    .all()) as Array<{ entity_type: TrashEntityType; payload: string }>;
  for (const row of trashRows) {
    try {
      const payload = JSON.parse(row.payload) as unknown;
      for (const storedPath of extractStoredPathsFromTrashPayload(row.entity_type, payload)) {
        addReferencedKey(keys, storedPath);
      }
    } catch {
      // Ignore malformed trash payloads.
    }
  }

  return keys;
}

function ageHours(modifiedAt: Date, now = Date.now()): number {
  return Math.max(0, (now - modifiedAt.getTime()) / (60 * 60 * 1000));
}

export async function listStoredReceiptCandidates(): Promise<StoredReceiptCandidate[]> {
  const now = Date.now();

  if (isR2Configured()) {
    const objects = await listR2Objects('receipts/');
    return objects.map((obj) => ({
      storageKey: obj.key,
      path: publicObjectUrl(obj.key),
      modifiedAt: obj.lastModified,
      ageHours: ageHours(obj.lastModified, now),
    }));
  }

  const dir = resolveReceiptsDir();
  if (!fs.existsSync(dir)) return [];

  const candidates: StoredReceiptCandidate[] = [];
  for (const name of fs.readdirSync(dir)) {
    if (!isManagedStoredPath(name)) continue;
    const full = path.join(dir, name);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(full);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;
    const modifiedAt = stat.mtime;
    candidates.push({
      storageKey: `local:${name}`,
      path: name,
      modifiedAt,
      ageHours: ageHours(modifiedAt, now),
    });
  }
  return candidates;
}

export function findOrphanReceiptCandidates(
  candidates: StoredReceiptCandidate[],
  referenced: Set<string>,
  minAgeHours: number,
): StoredReceiptCandidate[] {
  return candidates.filter(
    (candidate) =>
      !referenced.has(candidate.storageKey) && candidate.ageHours >= minAgeHours,
  );
}

export async function sweepOrphanReceipts(options?: {
  minAgeHours?: number;
  dryRun?: boolean;
  sampleLimit?: number;
}): Promise<OrphanReceiptSweepResult> {
  const minAgeHours = Math.max(1, options?.minAgeHours ?? DEFAULT_ORPHAN_MIN_AGE_HOURS);
  const dryRun = options?.dryRun ?? false;
  const sampleLimit = options?.sampleLimit ?? ORPHAN_SWEEP_SAMPLE_LIMIT;
  const referenced = await collectReferencedStorageKeys();
  const candidates = await listStoredReceiptCandidates();
  const orphans = findOrphanReceiptCandidates(candidates, referenced, minAgeHours);

  let deleted = 0;
  if (!dryRun) {
    for (const orphan of orphans) {
      if (await deleteStoredFile(orphan.path)) deleted += 1;
    }
  }

  return {
    dry_run: dryRun,
    min_age_hours: minAgeHours,
    storage: isR2Configured() ? 'r2' : 'local',
    scanned: candidates.length,
    referenced: referenced.size,
    orphans: orphans.length,
    deleted,
    samples: orphans.slice(0, sampleLimit),
  };
}
