import { describe, expect, it, beforeEach } from 'vitest';
import {
  customerContactFingerprint,
  mergeCustomerFields,
  syncCustomerFromOrder,
  upsertCustomer,
  migrateCustomerDedupOnce,
} from '@/lib/customer-server';
import { wooCompanyName } from '@/lib/woocommerce';
import type { WooOrder } from '@/lib/woocommerce';

describe('customerContactFingerprint', () => {
  it('returns null for empty name', () => {
    expect(customerContactFingerprint({ name: '  ' })).toBeNull();
  });

  it('normalizes email case and empty fields', () => {
    expect(
      customerContactFingerprint({
        name: 'Alice',
        email: 'A@B.COM',
        orderType: null,
      })
    ).toEqual({
      name: 'Alice',
      companyName: '',
      phone: '',
      email: 'a@b.com',
      address: '',
      ordered: '',
    });
  });
});

describe('mergeCustomerFields', () => {
  it('prefers incoming non-empty values', () => {
    const canonical = {
      id: 1,
      user_id: 1,
      name: 'Old',
      company_name: 'Co',
      email: 'old@x.com',
      phone: '111',
      address: 'HK',
      ordered: 'A',
      created_at: '2024-01-01',
    };
    const merged = mergeCustomerFields(canonical, {
      name: 'New',
      phone: '',
      email: 'new@x.com',
    });
    expect(merged.name).toBe('New');
    expect(merged.email).toBe('new@x.com');
    expect(merged.phone).toBe('111');
    expect(merged.company_name).toBe('Co');
  });
});

describe('wooCompanyName', () => {
  it('prefers billing.company over shipping.company', () => {
    const order = {
      number: '1',
      billing: { company: 'Billing Co' },
      shipping: { company: 'Shipping Co' },
    } as WooOrder;
    expect(wooCompanyName(order)).toBe('Billing Co');
  });

  it('falls back to shipping.company', () => {
    const order = {
      number: '1',
      billing: {},
      shipping: { company: 'Ship Only' },
    } as WooOrder;
    expect(wooCompanyName(order)).toBe('Ship Only');
  });

  it('returns null when no company', () => {
    const order = { number: '1', billing: {}, shipping: {} } as WooOrder;
    expect(wooCompanyName(order)).toBeNull();
  });
});

const hasDb = Boolean(process.env.DATABASE_URL?.trim());
const TEST_USER_ID = 99903;

describe.skipIf(!hasDb)('syncCustomerFromOrder (db)', () => {
  beforeEach(async () => {
    const db = (await import('@/lib/db')).default;
    await db.prepare('DELETE FROM customers WHERE user_id = ?').run(TEST_USER_ID);
    await db.prepare('DELETE FROM users WHERE id = ?').run(TEST_USER_ID);
    await db.prepare('INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)').run(
      TEST_USER_ID,
      `test-${TEST_USER_ID}@example.com`,
      'hash',
      'Test User'
    );
  });

  it('creates customer when contact is new', async () => {
    const db = (await import('@/lib/db')).default;
    const id = await syncCustomerFromOrder(TEST_USER_ID, {
      name: '陳大文',
      phone: '91234567',
      email: 'a@example.com',
      address: 'HK',
      companyName: 'Acme Ltd',
      orderType: 'honour訂製',
    });
    expect(id).toBeTruthy();
    const row = await db.prepare('SELECT * FROM customers WHERE id = ?').get(id!) as {
      name: string;
      ordered: string;
      company_name: string;
    };
    expect(row.name).toBe('陳大文');
    expect(row.ordered).toBe('honour訂製');
    expect(row.company_name).toBe('Acme Ltd');
  });

  it('reuses row on exact name match', async () => {
    const db = (await import('@/lib/db')).default;
    const first = await syncCustomerFromOrder(TEST_USER_ID, {
      name: 'Bob',
      phone: '111',
      orderType: 'Nestiee 燕窩訂單',
    });
    const second = await syncCustomerFromOrder(TEST_USER_ID, {
      name: 'bob',
      phone: '111',
      orderType: 'Nestiee 燕窩訂單',
    });
    expect(second).toBe(first);
    const count = await db
      .prepare('SELECT COUNT(*) as c FROM customers WHERE user_id = ? AND name = ?')
      .get(TEST_USER_ID, 'Bob') as { c: number };
    expect(Number(count.c)).toBe(1);
  });

  it('updates existing row when ordered differs but name matches', async () => {
    const db = (await import('@/lib/db')).default;
    const first = await syncCustomerFromOrder(TEST_USER_ID, {
      name: '陳大文',
      phone: '91234567',
      orderType: 'honour訂製',
    });
    await syncCustomerFromOrder(TEST_USER_ID, {
      name: '陳大文',
      phone: '91234567',
      orderType: 'Nestiee 燕窩訂單',
    });
    const rows = await db
      .prepare('SELECT id, ordered FROM customers WHERE user_id = ? AND name = ?')
      .all(TEST_USER_ID, '陳大文') as { id: number; ordered: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(first);
    expect(rows[0].ordered).toBe('Nestiee 燕窩訂單');
  });

  it('updates existing row when phone matches', async () => {
    const db = (await import('@/lib/db')).default;
    const first = await syncCustomerFromOrder(TEST_USER_ID, {
      name: 'Same',
      phone: '999',
      orderType: 'Cupmoka',
    });
    await syncCustomerFromOrder(TEST_USER_ID, {
      name: 'Same Person',
      phone: '999',
      orderType: 'Cupmoka',
    });
    const count = await db
      .prepare('SELECT COUNT(*) as c FROM customers WHERE user_id = ? AND phone = ?')
      .get(TEST_USER_ID, '999') as { c: number };
    expect(Number(count.c)).toBe(1);
    const row = await db.prepare('SELECT name FROM customers WHERE id = ?').get(first!) as { name: string };
    expect(row.name).toBe('Same Person');
  });

  it('updates existing row when email matches', async () => {
    const db = (await import('@/lib/db')).default;
    const first = await syncCustomerFromOrder(TEST_USER_ID, {
      name: 'Alpha',
      email: 'match@example.com',
    });
    await syncCustomerFromOrder(TEST_USER_ID, {
      name: 'Beta',
      email: 'match@example.com',
    });
    const count = await db
      .prepare('SELECT COUNT(*) as c FROM customers WHERE user_id = ?')
      .get(TEST_USER_ID) as { c: number };
    expect(Number(count.c)).toBe(1);
    const row = await db.prepare('SELECT name FROM customers WHERE id = ?').get(first!) as { name: string };
    expect(row.name).toBe('Beta');
  });

  it('merges two rows when incoming matches both by different fields', async () => {
    const db = (await import('@/lib/db')).default;
    const byName = await upsertCustomer(TEST_USER_ID, { name: 'Merge A', phone: '100' });
    const byEmail = await upsertCustomer(TEST_USER_ID, {
      name: 'Merge B',
      email: 'merge@example.com',
    });
    expect(byName.created).toBe(true);
    expect(byEmail.created).toBe(true);

    const result = await upsertCustomer(TEST_USER_ID, {
      name: 'Merge A',
      email: 'merge@example.com',
      phone: '200',
    });
    const count = await db
      .prepare('SELECT COUNT(*) as c FROM customers WHERE user_id = ?')
      .get(TEST_USER_ID) as { c: number };
    expect(Number(count.c)).toBe(1);
    expect(result.created).toBe(false);
    const row = await db.prepare('SELECT * FROM customers WHERE id = ?').get(result.id) as {
      name: string;
      email: string;
      phone: string;
    };
    expect(row.name).toBe('Merge A');
    expect(row.email).toBe('merge@example.com');
    expect(row.phone).toBe('200');
  });

  it('preserves existing fields when incoming values are empty', async () => {
    const db = (await import('@/lib/db')).default;
    const id = await syncCustomerFromOrder(TEST_USER_ID, {
      name: 'Keep Fields',
      email: 'keep@example.com',
      address: 'Address HK',
    });
    await syncCustomerFromOrder(TEST_USER_ID, {
      name: 'Keep Fields',
      email: '',
      address: '',
    });
    const row = await db.prepare('SELECT email, address FROM customers WHERE id = ?').get(id!) as {
      email: string;
      address: string;
    };
    expect(row.email).toBe('keep@example.com');
    expect(row.address).toBe('Address HK');
  });

  it('returns null for empty name', async () => {
    expect(await syncCustomerFromOrder(TEST_USER_ID, { name: '' })).toBeNull();
  });
});

describe.skipIf(!hasDb)('migrateCustomerDedupOnce', () => {
  beforeEach(async () => {
    const db = (await import('@/lib/db')).default;
    await db.prepare('DELETE FROM invoices WHERE user_id = ?').run(TEST_USER_ID);
    await db.prepare('DELETE FROM customers WHERE user_id = ?').run(TEST_USER_ID);
    await db.prepare('DELETE FROM users WHERE id = ?').run(TEST_USER_ID);
    await db.prepare('DELETE FROM app_migrations WHERE key = ?').run('customers_contact_dedup_v1');
    await db.prepare('INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)').run(
      TEST_USER_ID,
      `test-${TEST_USER_ID}@example.com`,
      'hash',
      'Test User'
    );
  });

  it('merges duplicates and repoints invoices; idempotent on second run', async () => {
    const db = (await import('@/lib/db')).default;
    const r1 = await db
      .prepare(
        `INSERT INTO customers (user_id, name, email, phone) VALUES (?, ?, ?, ?) RETURNING id`
      )
      .run(TEST_USER_ID, 'Dup Name', 'old@example.com', '555');
    const r2 = await db
      .prepare(`INSERT INTO customers (user_id, name, email, phone) VALUES (?, ?, ?, ?) RETURNING id`)
      .run(TEST_USER_ID, 'Dup Name', 'new@example.com', '666');
    const oldId = Number(r1.lastInsertRowid);
    const newId = Number(r2.lastInsertRowid);

    await db
      .prepare(
        `INSERT INTO invoices (user_id, customer_id, invoice_number, issue_date, due_date)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(TEST_USER_ID, oldId, 'INV-TEST-001', '2026-01-01', '2026-02-01');

    await migrateCustomerDedupOnce();

    const custCount = await db
      .prepare('SELECT COUNT(*) as c FROM customers WHERE user_id = ? AND name = ?')
      .get(TEST_USER_ID, 'Dup Name') as { c: number };
    expect(Number(custCount.c)).toBe(1);

    const inv = await db
      .prepare('SELECT customer_id FROM invoices WHERE invoice_number = ?')
      .get('INV-TEST-001') as { customer_id: number };
    expect(inv.customer_id).toBe(newId);

    await migrateCustomerDedupOnce();
    const custCount2 = await db
      .prepare('SELECT COUNT(*) as c FROM customers WHERE user_id = ?')
      .get(TEST_USER_ID) as { c: number };
    expect(Number(custCount2.c)).toBe(1);
  });
});
