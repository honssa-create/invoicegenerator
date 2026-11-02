import { beforeEach, describe, expect, it } from 'vitest';

const hasDb = Boolean(process.env.DATABASE_URL?.trim());
const USER_ID = 99942;

describe.skipIf(!hasDb)('list speed queries', () => {
  beforeEach(async () => {
    const db = (await import('./db')).default;
    await db.prepare('DELETE FROM users WHERE id = ?').run(USER_ID);
    await db
      .prepare('INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)')
      .run(USER_ID, `speed-${USER_ID}@example.com`, 'hash', 'Speed Test');
  });

  it('pages payment ledger rows and returns one updated category', async () => {
    const db = (await import('./db')).default;
    const { listPaymentLedger, updatePaymentLedgerCategory } = await import('./payment-ledger-server');
    await db
      .prepare(
        `INSERT INTO payment_ledger (user_id, dedupe_key, paid_date, amount, order_no, notes, source, category)
         VALUES (?, ?, ?, ?, ?, ?, 'comment', ?), (?, ?, ?, ?, ?, ?, 'comment', ?), (?, ?, ?, ?, ?, ?, 'comment', ?)`,
      )
      .run(
        USER_ID, 'a', '2026-04-01', 10, 'A1', 'alpha', '回禮',
        USER_ID, 'b', '2026-04-20', 20, 'B2', 'beta nest', '燕窩',
        USER_ID, 'c', '2026-03-01', 30, 'C3', 'gamma', '回禮',
      );

    const april = await listPaymentLedger(USER_ID, { dateStart: '2026-04-01', dateEnd: '2026-04-30', limit: 1, offset: 0 });
    expect(april.total).toBe(2);
    expect(april.entries).toHaveLength(1);
    expect(april.entries[0].paid_date).toBe('2026-04-20');

    const nests = await listPaymentLedger(USER_ID, { category: '燕窩', q: 'nest' });
    expect(nests.total).toBe(1);
    expect(nests.entries[0].order_no).toBe('B2');

    const edited = await updatePaymentLedgerCategory(USER_ID, nests.entries[0].id, '襟章');
    expect(edited?.category).toBe('襟章');
    expect(edited?.id).toBe(nests.entries[0].id);
  });

  it('filters accounting installments by month and aggregates in SQL', async () => {
    const db = (await import('./db')).default;
    const { listAccountingEntries } = await import('./accounting-server');
    await db
      .prepare(
        `INSERT INTO orders (user_id, reference_number, po_number, name, description, order_type, fields_json, created_at)
         VALUES (?, 'ORD-0000001', 'PO-1', 'Ada', 'Badges', 'honour訂製', ?, '2026-04-15 10:00:00')`,
      )
      .run(
        USER_ID,
        JSON.stringify({
          payment_amount: '100',
          payment_date: '2026-04-02',
          payment_bank: 'HSBC',
          payment2_amount: '50',
          payment2_date: '2026-03-01',
          payment2_verified: true,
        }),
      );

    const april = await listAccountingEntries(USER_ID, { month: '2026-04', pendingOnly: false, limit: 50, offset: 0 });
    expect(april.summary).toEqual({ total: 1, verified: 0, pending: 1 });
    expect(april.entries.map((row) => row.payment_slot)).toEqual([1]);
    expect(april.entries[0].amount).toBe('100');
    expect(april.entries[0].customer).toBe('Ada');

    const all = await listAccountingEntries(USER_ID, { month: '', pendingOnly: false, limit: 50, offset: 0 });
    expect(all.summary).toEqual({ total: 2, verified: 1, pending: 1 });
    expect(all.month).toBe('all');

    const pending = await listAccountingEntries(USER_ID, { month: '', pendingOnly: true, limit: 50, offset: 0 });
    expect(pending.total).toBe(1);
    expect(pending.entries).toHaveLength(1);
    expect(pending.entries[0].verified).toBe(false);
  });

  it('sums a cashflow month in SQL and pages the ledger', async () => {
    const db = (await import('./db')).default;
    const { listCashflowMonth } = await import('./cashflow-server');
    await db
      .prepare(
        `INSERT INTO orders (user_id, reference_number, po_number, fields_json, created_at)
         VALUES (?, 'ORD-0000002', '88', ?, '2026-04-01 09:00:00')`,
      )
      .run(USER_ID, JSON.stringify({ payment_amount: '250.5', payment_date: '2026-04-03', payment_bank: 'BOC' }));
    await db
      .prepare(
        `INSERT INTO other_income (user_id, category, txn_date, amount, account, remarks, verified)
         VALUES (?, '租金收入', '2026-04-10', 1000, 'HSBC', 'rent', 1), (?, '其他', '2026-03-01', 5, 'HSBC', 'old', 0)`,
      )
      .run(USER_ID, USER_ID);

    const page = await listCashflowMonth(USER_ID, { month: '2026-04', limit: 1, offset: 0 });
    expect(page.totals).toEqual({ productSales: 250.5, otherIncome: 1000, gross: 1250.5 });
    expect(page.total).toBe(2);
    expect(page.entries).toHaveLength(1);
    expect(page.entries[0].date).toBe('2026-04-10');
  });

  it('summarizes reconciliation without returning every row', async () => {
    const db = (await import('./db')).default;
    const { listReconciliationPage } = await import('./reconciliation-server');
    await db
      .prepare(
        `INSERT INTO reconciliation_records
           (user_id, deposit_time, gross_amount, payment_method, status, confidence, transaction_fee, net_amount, source, remarks)
         VALUES
           (?, '2026-04-02 10:00:00', 100, 'FPS', 'Pending Approval', 'high', 0, 100, 'manual', 'alpha'),
           (?, '2026-03-02 10:00:00', 40, 'FPS', 'Matched', NULL, 0, 40, 'manual', 'beta')`,
      )
      .run(USER_ID, USER_ID);

    const page = await listReconciliationPage(USER_ID, {
      zone: 'high',
      limit: 50,
      offset: 0,
      hydrateSuggestedAmounts: false,
    });
    expect(page.summary.total).toBe(2);
    expect(page.summary.pendingHigh).toBe(1);
    expect(page.summary.matched).toBe(1);
    expect(page.summary.grossTotal).toBe(140);
    expect(page.total).toBe(1);
    expect(page.records).toHaveLength(1);
    expect(page.records[0].remarks).toBe('alpha');

    const linked = await listReconciliationPage(USER_ID, {
      linkOrderId: 4242,
      linkAmount: 100,
      linkDate: '2026-04-02',
      limit: 50,
      offset: 0,
      hydrateSuggestedAmounts: false,
    });
    expect(linked.linkRelatedTotal).toBe(1);
    expect(linked.records.map((row) => row.remarks)).toEqual(['alpha']);

    const searched = await listReconciliationPage(USER_ID, {
      q: 'beta',
      limit: 50,
      offset: 0,
      hydrateSuggestedAmounts: false,
    });
    expect(searched.total).toBe(1);
    expect(searched.records[0].status).toBe('Matched');
  });

  it('caps invoice options and reads distinct order tags', async () => {
    const db = (await import('./db')).default;
    const { listInvoiceOptions } = await import('./invoices');
    const { loadOrderDetailBootstrap } = await import('./order-detail-bootstrap-server');
    const customer = (await db
      .prepare('INSERT INTO customers (user_id, name) VALUES (?, ?) RETURNING id')
      .get(USER_ID, 'Ada')) as { id: number };
    await db
      .prepare(
        `INSERT INTO invoices (user_id, customer_id, invoice_number, status, issue_date, due_date)
         VALUES (?, ?, '00000001', 'draft', '2026-04-01', '2026-04-30'), (?, ?, '00000002', 'sent', '2026-04-02', '2026-05-02')`,
      )
      .run(USER_ID, customer.id, USER_ID, customer.id);
    const order = (await db
      .prepare(
        `INSERT INTO orders (user_id, reference_number, fields_json)
         VALUES (?, 'ORD-0000003', ?)
         RETURNING id`,
      )
      .get(USER_ID, JSON.stringify({ tags: JSON.stringify(['燕窩', '急']) }))) as { id: number };

    const options = await listInvoiceOptions(USER_ID, { limit: 1, q: '00000002' });
    expect(options).toEqual([{ id: expect.any(Number), invoice_number: '00000002', status: 'sent' }]);

    const bootstrap = await loadOrderDetailBootstrap(USER_ID, String(order.id));
    expect(bootstrap?.tagSuggestions).toEqual(['急', '燕窩']);
    expect(bootstrap?.invoices.length).toBeLessThanOrEqual(40);
    expect(bootstrap?.order.id).toBe(order.id);
  });
});
