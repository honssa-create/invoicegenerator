import { describe, expect, it, beforeEach } from 'vitest';
import {
  customerContactFingerprint,
  syncCustomerFromOrder,
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

  it('creates customer when fingerprint is new', async () => {
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

  it('reuses row on exact fingerprint match', async () => {
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

  it('creates second row when ordered differs', async () => {
    const db = (await import('@/lib/db')).default;
    await syncCustomerFromOrder(TEST_USER_ID, {
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
      .prepare('SELECT ordered FROM customers WHERE user_id = ? AND name = ? ORDER BY ordered')
      .all(TEST_USER_ID, '陳大文') as { ordered: string }[];
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.ordered).sort()).toEqual(['Nestiee 燕窩訂單', 'honour訂製']);
  });

  it('creates second row when phone differs', async () => {
    const db = (await import('@/lib/db')).default;
    await syncCustomerFromOrder(TEST_USER_ID, { name: 'Same', phone: '1', orderType: 'Cupmoka' });
    await syncCustomerFromOrder(TEST_USER_ID, { name: 'Same', phone: '2', orderType: 'Cupmoka' });
    const count = await db
      .prepare('SELECT COUNT(*) as c FROM customers WHERE user_id = ? AND name = ?')
      .get(TEST_USER_ID, 'Same') as { c: number };
    expect(Number(count.c)).toBe(2);
  });

  it('returns null for empty name', async () => {
    expect(await syncCustomerFromOrder(TEST_USER_ID, { name: '' })).toBeNull();
  });
});
