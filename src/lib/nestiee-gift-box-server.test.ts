import { beforeEach, describe, expect, it } from 'vitest';
import db from '@/lib/db';
import { NESTIEE_ORDER_TYPE } from '@/lib/orders';
import { migrateNestieeGiftBoxQtysOnce } from '@/lib/nestiee-gift-box-server';

const hasDb = Boolean(process.env.DATABASE_URL?.trim());
const TEST_USER_ID = 99931;
const MIGRATION_KEY = 'nestiee_gift_box_qty_from_lines_v4';

describe.skipIf(!hasDb)('migrateNestieeGiftBoxQtysOnce', () => {
  beforeEach(async () => {
    await db.prepare('DELETE FROM orders WHERE user_id = ?').run(TEST_USER_ID);
    await db.prepare('DELETE FROM users WHERE id = ?').run(TEST_USER_ID);
    await db.prepare('DELETE FROM app_migrations WHERE key = ?').run(MIGRATION_KEY);
    await db.prepare('INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)').run(
      TEST_USER_ID,
      `test-${TEST_USER_ID}@example.com`,
      'hash',
      'Test User'
    );
  });

  it('persists 所需禮盒 from nestiee_lines on older orders', async () => {
    const fields = {
      order_type: NESTIEE_ORDER_TYPE,
      nestiee_lines: JSON.stringify([
        { name: '星空金', quantity: 2, unit_price: 344, line_total: 688 },
        { name: '紅色銀', quantity: 3, unit_price: 10, line_total: 30 },
      ]),
    };
    const inserted = await db
      .prepare(
        `INSERT INTO orders (user_id, name, status, source_platform, original_order_id, reference_number, order_type, fields_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        TEST_USER_ID,
        'Woo #10609',
        'processing',
        'nestiee',
        '10609',
        'ORD-0010609',
        NESTIEE_ORDER_TYPE,
        JSON.stringify(fields)
      );
    const orderId = inserted.lastInsertRowid;

    const first = await migrateNestieeGiftBoxQtysOnce();
    expect(first.updated).toBeGreaterThanOrEqual(1);

    const row = (await db.prepare('SELECT fields_json FROM orders WHERE id = ?').get(orderId)) as {
      fields_json: string;
    };
    const saved = JSON.parse(row.fields_json) as Record<string, string>;
    expect(saved.nestiee_gift_qty_star_gold).toBe('2');
    expect(saved.nestiee_gift_qty_red_silver).toBe('3');

    const second = await migrateNestieeGiftBoxQtysOnce();
    expect(second.updated).toBe(0);
  });
});
