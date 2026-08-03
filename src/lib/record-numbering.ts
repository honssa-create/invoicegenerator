import db from './db';
import {
  MAX_RECORD_SERIAL,
  formatDocumentNumber,
  formatOrderReference,
  type GlobalRecordType,
} from './record-numbering-core';

export * from './record-numbering-core';

/** Atomically reserve the next office-wide number. Call inside the record insert transaction. */
export async function allocateGlobalRecordNumber(recordType: GlobalRecordType): Promise<string> {
  const row = await db
    .prepare(
      `UPDATE global_record_sequences
       SET next_serial = next_serial + 1
       WHERE record_type = ?
       RETURNING next_serial - 1 AS serial`,
    )
    .get(recordType) as { serial: number } | undefined;

  if (!row) {
    throw new Error(`Global ${recordType} sequence is not initialized`);
  }
  const serial = Number(row.serial);
  if (serial > MAX_RECORD_SERIAL[recordType]) {
    throw new Error(`Global ${recordType} sequence is exhausted`);
  }
  return recordType === 'order' ? formatOrderReference(serial) : formatDocumentNumber(serial);
}
