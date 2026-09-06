import fs from 'fs';
import { isStoredImageUrl } from './image-url';
import { receiptFilePath } from './receipt';
import { getR2Client, isR2Configured, r2KeyFromPublicUrl } from './r2';
import type { TrashEntityType } from './trash-constants';

const PAYMENT_RECEIPT_FIELD_KEYS = [
  'payment_receipt_path',
  'payment2_receipt_path',
  'payment3_receipt_path',
] as const;

function normalizeStoredPath(path: string | null | undefined): string {
  return path?.trim() || '';
}

/** Stable key for comparing DB paths with storage inventory (R2 key or `local:filename`). */
export function canonicalStorageKey(path: string | null | undefined): string | null {
  const trimmed = normalizeStoredPath(path);
  if (!trimmed) return null;
  const r2Key = r2KeyFromPublicUrl(trimmed);
  if (r2Key) return r2Key;
  if (isStoredImageUrl(trimmed)) return null;
  if (!isManagedStoredPath(trimmed)) return null;
  return `local:${trimmed}`;
}

/** True for our R2 public URLs or bare receipt filenames (not third-party http links). */
export function isManagedStoredPath(path: string | null | undefined): path is string {
  const trimmed = normalizeStoredPath(path);
  if (!trimmed) return false;
  if (r2KeyFromPublicUrl(trimmed)) return true;
  if (isStoredImageUrl(trimmed)) return false;
  const base = trimmed.split(/[/\\]/).pop() || '';
  return base === trimmed && !trimmed.includes('..');
}

export async function deleteStoredFile(path: string | null | undefined): Promise<boolean> {
  const trimmed = normalizeStoredPath(path);
  if (!isManagedStoredPath(trimmed)) return false;

  const r2Key = r2KeyFromPublicUrl(trimmed);
  if (r2Key && isR2Configured()) {
    try {
      const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
      await getR2Client().send(
        new DeleteObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME!,
          Key: r2Key,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  const filePath = receiptFilePath(trimmed);
  if (!filePath) return false;
  try {
    fs.unlinkSync(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function deleteStoredFiles(
  paths: Array<string | null | undefined>,
): Promise<number> {
  let count = 0;
  for (const path of paths) {
    if (await deleteStoredFile(path)) count += 1;
  }
  return count;
}

export async function deleteReplacedStoredFile(
  oldPath: string | null | undefined,
  newPath: string | null | undefined,
): Promise<void> {
  const oldTrim = normalizeStoredPath(oldPath);
  const newTrim = normalizeStoredPath(newPath);
  if (!oldTrim || oldTrim === newTrim) return;
  await deleteStoredFile(oldTrim);
}

export async function deleteStoredPathsExcept(
  oldPaths: Array<string | null | undefined>,
  keepPaths: Array<string | null | undefined>,
): Promise<void> {
  const keep = new Set(keepPaths.map((p) => normalizeStoredPath(p)).filter(Boolean));
  for (const path of oldPaths) {
    const trimmed = normalizeStoredPath(path);
    if (!trimmed || keep.has(trimmed)) continue;
    await deleteStoredFile(trimmed);
  }
}

export function orderPaymentReceiptPaths(fields: Record<string, unknown>): string[] {
  return PAYMENT_RECEIPT_FIELD_KEYS.map((key) => {
    const value = fields[key];
    return typeof value === 'string' ? value.trim() : '';
  }).filter(Boolean);
}

export async function cleanupReplacedOrderPaymentReceipts(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Promise<void> {
  for (const key of PAYMENT_RECEIPT_FIELD_KEYS) {
    const oldVal = typeof before[key] === 'string' ? before[key].trim() : '';
    const newVal = typeof after[key] === 'string' ? after[key].trim() : '';
    if (oldVal && oldVal !== newVal) await deleteStoredFile(oldVal);
  }
}

function pushPath(out: string[], path: unknown): void {
  if (typeof path === 'string' && path.trim()) out.push(path.trim());
}

function pathsFromFieldsJson(raw: unknown): string[] {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const fields = JSON.parse(raw) as Record<string, unknown>;
    return orderPaymentReceiptPaths(fields);
  } catch {
    return [];
  }
}

/** Collect managed file paths from a trashed entity payload before permanent purge. */
export function extractStoredPathsFromTrashPayload(
  entityType: TrashEntityType,
  payload: unknown,
): string[] {
  if (!payload || typeof payload !== 'object') return [];
  const data = payload as Record<string, unknown>;
  const paths: string[] = [];

  switch (entityType) {
    case 'expense': {
      const expense = data.expense as Record<string, unknown> | undefined;
      pushPath(paths, expense?.receipt_path);
      for (const row of (data.receipts as Record<string, unknown>[] | undefined) || []) {
        pushPath(paths, row.path);
      }
      break;
    }
    case 'invoice':
    case 'quotation':
      for (const row of (data.files as Record<string, unknown>[] | undefined) || []) {
        pushPath(paths, row.path);
      }
      break;
    case 'order': {
      const order = data.order as Record<string, unknown> | undefined;
      paths.push(...pathsFromFieldsJson(order?.fields_json));
      for (const row of (data.files as Record<string, unknown>[] | undefined) || []) {
        pushPath(paths, row.path);
      }
      break;
    }
    case 'other_income': {
      const income = data.income as Record<string, unknown> | undefined;
      pushPath(paths, income?.receipt_path);
      break;
    }
    case 'inbound': {
      const shipment = data.shipment as Record<string, unknown> | undefined;
      pushPath(paths, shipment?.photo_path);
      break;
    }
    case 'order_file':
    case 'quotation_file':
    case 'invoice_file': {
      const file = data.file as Record<string, unknown> | undefined;
      pushPath(paths, file?.path);
      break;
    }
    default:
      break;
  }

  return Array.from(new Set(paths.filter(isManagedStoredPath)));
}
