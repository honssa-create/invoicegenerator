import { describe, expect, it, beforeEach } from 'vitest';
import db from '@/lib/db';
import {
  allocateExpenseReportIdAtomic,
  assignExpenseNumbersAtomic,
  generateReceiptNumberAtomic,
  isValidExpenseReceiptNo,
  isValidExpenseReportId,
  migrateExpenseNumberingOnce,
  syncExpenseReportSequenceFromDb,
} from '@/lib/expense-server';

const TEST_USER_ID = 99902;

beforeEach(async () => {
  await db.prepare('DELETE FROM expenses WHERE user_id = ?').run(TEST_USER_ID);
  await db.prepare('DELETE FROM users WHERE id = ?').run(TEST_USER_ID);
  await db.prepare('INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)').run(
    TEST_USER_ID,
    `test-${TEST_USER_ID}@example.com`,
    'hash',
    'Test User'
  );
  await db.prepare('UPDATE expense_report_sequence SET next_serial = 1 WHERE id = 1').run();
  await db.prepare('DELETE FROM app_migrations WHERE key = ?').run('expense_numbering_v2');
});

describe('expense numbering', () => {
  it('allocates global Expense IDs in upload order', async () => {
    await db.transaction(async () => {
      const a = await allocateExpenseReportIdAtomic();
      const b = await allocateExpenseReportIdAtomic();
      expect(a).toBe('EXP-0000001');
      expect(b).toBe('EXP-0000002');
    });
  });

  it('increments receipt serial per paid month and funding source', async () => {
    await db.transaction(async () => {
      const a = await assignExpenseNumbersAtomic(TEST_USER_ID, '2026-04-15', { fundingSource: 'cc_self' });
      await db.prepare(
        `INSERT INTO expenses (user_id, batch_id, receipt_no, category, payment_status, paid_date, funding_source)
         VALUES (?, ?, ?, 'other', 'paid', ?, 'cc_self')`
      ).run(TEST_USER_ID, a.batchId, a.receiptNo, '2026-04-15');

      const b = await assignExpenseNumbersAtomic(TEST_USER_ID, '2026-04-20', { fundingSource: 'cc_self' });
      const c = await assignExpenseNumbersAtomic(TEST_USER_ID, '2026-04-21', { fundingSource: 'cc_company' });

      expect(a.receiptNo).toBe('EXP-202604-CCS001');
      expect(b.receiptNo).toBe('EXP-202604-CCS002');
      expect(c.receiptNo).toBe('EXP-202604-CCC001');
    });
  });

  it('assigns Expense ID + Receipt No together', async () => {
    await db.transaction(async () => {
      const { batchId, receiptNo } = await assignExpenseNumbersAtomic(TEST_USER_ID, '2026-04-10', {
        fundingSource: 'cash',
      });
      expect(isValidExpenseReportId(batchId)).toBe(true);
      expect(receiptNo).toBe('EXP-202604-CS001');
    });
  });

  it('syncExpenseReportSequenceFromDb advances sequence from existing rows', async () => {
    await db.prepare(
      `INSERT INTO expenses (user_id, batch_id, receipt_no, category, payment_status, paid_date, funding_source)
       VALUES (?, 'EXP-0000015', 'EXP-202604-CS001', 'other', 'paid', '2026-04-01', 'cash')`
    ).run(TEST_USER_ID);
    await db.prepare('UPDATE expense_report_sequence SET next_serial = 1 WHERE id = 1').run();

    await syncExpenseReportSequenceFromDb();

    const row = await db.prepare('SELECT next_serial FROM expense_report_sequence WHERE id = 1').get() as {
      next_serial: number;
    };
    expect(row.next_serial).toBeGreaterThanOrEqual(16);
  });

  it('migrateExpenseNumberingOnce fixes legacy batch_id and does not rerun', async () => {
    await db.prepare(
      `INSERT INTO expenses (user_id, batch_id, receipt_no, category, payment_status, paid_date, payment_method, funding_source)
       VALUES (?, 'EXP-202604-001', 'EXP-202604-001-CC001', 'other', 'paid', '2026-04-01', 'Credit Card', 'cc_self')`
    ).run(TEST_USER_ID);

    await migrateExpenseNumberingOnce();

    const expense = await db
      .prepare('SELECT batch_id, receipt_no FROM expenses WHERE user_id = ?')
      .get(TEST_USER_ID) as { batch_id: string; receipt_no: string };

    expect(isValidExpenseReportId(expense.batch_id)).toBe(true);
    expect(isValidExpenseReceiptNo(expense.receipt_no)).toBe(true);

    const beforeBatch = expense.batch_id;
    const beforeReceipt = expense.receipt_no;

    await migrateExpenseNumberingOnce();

    const again = await db
      .prepare('SELECT batch_id, receipt_no FROM expenses WHERE user_id = ?')
      .get(TEST_USER_ID) as { batch_id: string; receipt_no: string };

    expect(again.batch_id).toBe(beforeBatch);
    expect(again.receipt_no).toBe(beforeReceipt);
  });
});
