import { ensureSchema, getPool } from './db';
import {
  MAX_RECORD_SERIAL,
  formatDocumentNumber,
  formatOrderReference,
  type GlobalRecordType,
} from './record-numbering-core';

export * from './record-numbering-core';

const LIVE_MAX_SQL: Record<GlobalRecordType, string> = {
  order: `COALESCE((SELECT MAX(CAST(SUBSTR(reference_number, 5) AS INTEGER)) FROM orders WHERE reference_number ~ '^ORD-[0-9]{7}$'), 0)`,
  quotation: `COALESCE((SELECT MAX(CAST(quote_number AS INTEGER)) FROM quotations WHERE quote_number ~ '^[0-9]{8}$'), 0)`,
  invoice: `COALESCE((SELECT MAX(CAST(invoice_number AS INTEGER)) FROM invoices WHERE invoice_number ~ '^[0-9]{8}$'), 0)`,
};

/**
 * Sequence updates must use the pool (autocommit), never the ambient transaction.
 * Callers allocate inside `db.transaction` before INSERT; if that INSERT fails and
 * rolls back, a transactional sequence UPDATE would rewind and re-issue the same
 * number forever (e.g. stuck on ORD-0000008).
 */
async function bumpSequenceToLiveMax(recordType: GlobalRecordType): Promise<void> {
  await ensureSchema();
  const pool = getPool();
  await pool.query(
    `INSERT INTO global_record_sequences (record_type, next_serial)
     VALUES ($1, 1)
     ON CONFLICT (record_type) DO NOTHING`,
    [recordType],
  );
  await pool.query(
    `UPDATE global_record_sequences
     SET next_serial = GREATEST(next_serial, (${LIVE_MAX_SQL[recordType]}) + 1)
     WHERE record_type = $1`,
    [recordType],
  );
}

async function nextSerialRow(recordType: GlobalRecordType): Promise<{ serial: number } | undefined> {
  await ensureSchema();
  const res = await getPool().query<{ serial: string | number }>(
    `UPDATE global_record_sequences
     SET next_serial = next_serial + 1
     WHERE record_type = $1
     RETURNING next_serial - 1 AS serial`,
    [recordType],
  );
  const row = res.rows[0];
  return row ? { serial: Number(row.serial) } : undefined;
}

/** Atomically reserve the next office-wide number. Safe to call inside a record insert transaction. */
export async function allocateGlobalRecordNumber(recordType: GlobalRecordType): Promise<string> {
  await bumpSequenceToLiveMax(recordType);
  let row = await nextSerialRow(recordType);
  if (!row) {
    await bumpSequenceToLiveMax(recordType);
    row = await nextSerialRow(recordType);
  }

  if (!row) {
    throw new Error(`Global ${recordType} sequence is not initialized`);
  }
  const serial = Number(row.serial);
  if (serial > MAX_RECORD_SERIAL[recordType]) {
    throw new Error(`Global ${recordType} sequence is exhausted`);
  }
  return recordType === 'order' ? formatOrderReference(serial) : formatDocumentNumber(serial);
}
