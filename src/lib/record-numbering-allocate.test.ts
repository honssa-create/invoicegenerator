import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import db from '@/lib/db';
import { allocateGlobalRecordNumber } from '@/lib/record-numbering';

const TEST_USER_ID = 99905;
/** High fixtures so we don't collide with real local/prod-like ORD rows. */
const FIXTURE_A = 'ORD-9999908';
const FIXTURE_B = 'ORD-9999912';

beforeEach(async () => {
  await db.prepare('DELETE FROM orders WHERE user_id = ?').run(TEST_USER_ID);
  await db.prepare(`DELETE FROM orders WHERE reference_number IN (?, ?)`).run(FIXTURE_A, FIXTURE_B);
  await db.prepare('DELETE FROM users WHERE id = ?').run(TEST_USER_ID);
  await db
    .prepare('INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)')
    .run(TEST_USER_ID, `test-${TEST_USER_ID}@example.com`, 'hash', 'Test User');
});

afterEach(async () => {
  await db.prepare('DELETE FROM orders WHERE user_id = ?').run(TEST_USER_ID);
  await db.prepare(`DELETE FROM orders WHERE reference_number IN (?, ?)`).run(FIXTURE_A, FIXTURE_B);
  await db.prepare('DELETE FROM users WHERE id = ?').run(TEST_USER_ID);
});

describe('allocateGlobalRecordNumber', () => {
  it('does not rewind the sequence when an insert transaction rolls back', async () => {
    await db
      .prepare(
        `INSERT INTO orders (user_id, reference_number, name, status, fields_json)
         VALUES (?, ?, 'existing', 'OPEN', '{}')`,
      )
      .run(TEST_USER_ID, FIXTURE_A);
    // Stale counter below the live fixture serial (9999908).
    await db
      .prepare(`UPDATE global_record_sequences SET next_serial = 8 WHERE record_type = 'order'`)
      .run();

    const beforeSeq = (await db
      .prepare(`SELECT next_serial FROM global_record_sequences WHERE record_type = 'order'`)
      .get()) as { next_serial: number };

    await expect(
      db.transaction(async () => {
        const ref = await allocateGlobalRecordNumber('order');
        expect(ref).not.toBe(FIXTURE_A);
        // Force a unique-violation rollback after the number was reserved.
        await db
          .prepare(
            `INSERT INTO orders (user_id, reference_number, name, status, fields_json)
             VALUES (?, ?, 'should-fail-dup', 'OPEN', '{}')`,
          )
          .run(TEST_USER_ID, FIXTURE_A);
      }),
    ).rejects.toThrow(/idx_orders_reference_number|duplicate key/i);

    const afterSeq = (await db
      .prepare(`SELECT next_serial FROM global_record_sequences WHERE record_type = 'order'`)
      .get()) as { next_serial: number };
    // Sequence must stay advanced even though the insert txn rolled back.
    expect(Number(afterSeq.next_serial)).toBeGreaterThan(Number(beforeSeq.next_serial));
    expect(Number(afterSeq.next_serial)).toBeGreaterThan(9999908);

    const next = await allocateGlobalRecordNumber('order');
    expect(next).not.toBe(FIXTURE_A);
    expect(next).toMatch(/^ORD-\d{7}$/);
  });

  it('bumps past live ORD max before handing out a number', async () => {
    await db
      .prepare(
        `INSERT INTO orders (user_id, reference_number, name, status, fields_json)
         VALUES (?, ?, 'existing', 'OPEN', '{}')`,
      )
      .run(TEST_USER_ID, FIXTURE_B);
    await db
      .prepare(`UPDATE global_record_sequences SET next_serial = 3 WHERE record_type = 'order'`)
      .run();

    const ref = await allocateGlobalRecordNumber('order');
    expect(ref).toBe('ORD-9999913');
  });

  it('skips a live ORD number when the sequence still points at it', async () => {
    await db
      .prepare(
        `INSERT INTO orders (user_id, reference_number, name, status, fields_json)
         VALUES (?, ?, 'existing', 'OPEN', '{}')`,
      )
      .run(TEST_USER_ID, FIXTURE_A);
    await db
      .prepare(`UPDATE global_record_sequences SET next_serial = 9999908 WHERE record_type = 'order'`)
      .run();

    const ref = await allocateGlobalRecordNumber('order');
    expect(ref).not.toBe(FIXTURE_A);
    expect(ref).toMatch(/^ORD-\d{7}$/);
    expect(Number(ref.slice(4))).toBeGreaterThan(9999908);
  });
});
