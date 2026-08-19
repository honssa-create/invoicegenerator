import db from './db';
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

async function nextSerialRow(recordType: GlobalRecordType): Promise<{ serial: number } | undefined> {
  return (await db
    .prepare(
      `UPDATE global_record_sequences
       SET next_serial = next_serial + 1
       WHERE record_type = ?
       RETURNING next_serial - 1 AS serial`,
    )
    .get(recordType)) as { serial: number } | undefined;
}

/** Keep the sequence at or above MAX(live numbers)+1 so inserts cannot collide. */
async function bumpSequenceToLiveMax(recordType: GlobalRecordType): Promise<void> {
  await db
    .prepare(
      `INSERT INTO global_record_sequences (record_type, next_serial)
       VALUES (?, 1)
       ON CONFLICT (record_type) DO NOTHING`,
    )
    .run(recordType);
  await db
    .prepare(
      `UPDATE global_record_sequences
       SET next_serial = GREATEST(next_serial, (${LIVE_MAX_SQL[recordType]}) + 1)
       WHERE record_type = ?`,
    )
    .run(recordType);
}

/** Atomically reserve the next office-wide number. Call inside the record insert transaction. */
export async function allocateGlobalRecordNumber(recordType: GlobalRecordType): Promise<string> {
  await bumpSequenceToLiveMax(recordType);
  let row = await nextSerialRow(recordType);
  if (!row) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO global_record_sequences (record_type, next_serial) VALUES (?, 1)`,
      )
      .run(recordType);
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
