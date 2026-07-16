import path from 'path';
import { isR2Configured } from './r2';

/** How receipt binaries survive deploys: R2 URL, mounted volume, or ephemeral container disk. */
export type ReceiptStorageMode = 'r2' | 'volume' | 'ephemeral';

/** True when receipt files/URLs survive a Railway redeploy. */
export function getReceiptStorageMode(): ReceiptStorageMode {
  if (isR2Configured()) return 'r2';

  if (process.env.RECEIPTS_DIR?.trim()) return 'volume';

  const dbPath = process.env.DB_PATH?.trim();
  if (dbPath) {
    if (path.isAbsolute(dbPath) && dbPath.startsWith('/data/')) return 'volume';
    const defaultDataDb = path.join(process.cwd(), 'data', 'invoices.db');
    if (path.resolve(dbPath) !== path.resolve(defaultDataDb)) return 'volume';
  }

  return 'ephemeral';
}

export function isReceiptStoragePersistent(): boolean {
  return getReceiptStorageMode() !== 'ephemeral';
}

/**
 * Production deploys without R2 or a mounted DB_PATH lose container-local files.
 * Imported links should keep the remote URL instead of saving to ephemeral disk.
 */
export function shouldKeepRemoteUrlInsteadOfEphemeralSave(): boolean {
  return process.env.NODE_ENV === 'production' && getReceiptStorageMode() === 'ephemeral';
}

let ephemeralWarningLogged = false;

/** Log once on boot when production would lose receipt files on redeploy. */
export function warnIfEphemeralReceiptStorage(): void {
  if (process.env.NODE_ENV !== 'production') return;
  if (isReceiptStoragePersistent()) return;
  if (ephemeralWarningLogged) return;
  ephemeralWarningLogged = true;
  console.warn(
    '[InvoiceFlow] Receipt files are stored on the container filesystem and will be lost on redeploy. ' +
      'Configure R2_* env vars or set DB_PATH on a Railway volume (receipts co-locate to /data/receipts).',
  );
}
