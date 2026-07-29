import { describe, expect, it, beforeEach } from 'vitest';
import db from '@/lib/db';
import {
  addManagedOption,
  deleteManagedOption,
  ensureOptionsSeeded,
  mergedOptions,
  updateManagedOption,
} from '@/lib/expense-options-server';

const TEST_USER_ID = 99901;

beforeEach(async () => {
  await db.prepare('DELETE FROM expense_options WHERE user_id = ?').run(TEST_USER_ID);
  await db.prepare('DELETE FROM expense_option_settings WHERE user_id = ?').run(TEST_USER_ID);
  await db.prepare('DELETE FROM expenses WHERE user_id = ?').run(TEST_USER_ID);
  await db.prepare('DELETE FROM users WHERE id = ?').run(TEST_USER_ID);
  await db.prepare('INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)').run(
    TEST_USER_ID,
    `test-${TEST_USER_ID}@example.com`,
    'hash',
    'Test User'
  );
});

describe('expense-options-server', () => {
  it('merges defaults with custom values before seeding', async () => {
    await db.prepare('INSERT INTO expense_options (user_id, type, value) VALUES (?, ?, ?)').run(
      TEST_USER_ID,
      'supplier',
      'My Custom Supplier'
    );
    const options = await mergedOptions(TEST_USER_ID, 'supplier');
    expect(options).toContain('My Custom Supplier');
    expect(options.length).toBeGreaterThan(1);
  });

  it('uses DB only after seeding and allows deleting defaults', async () => {
    await ensureOptionsSeeded(TEST_USER_ID);
    const before = await mergedOptions(TEST_USER_ID, 'platform');
    expect(before).toContain('淘寶');

    const row = await db
      .prepare('SELECT id FROM expense_options WHERE user_id = ? AND type = ? AND value = ?')
      .get(TEST_USER_ID, 'platform', '淘寶') as { id: number };
    await deleteManagedOption(TEST_USER_ID, row.id);

    const after = await mergedOptions(TEST_USER_ID, 'platform');
    expect(after).not.toContain('淘寶');
  });

  it('renames option and updates matching expenses', async () => {
    await ensureOptionsSeeded(TEST_USER_ID);
    await db.prepare(
      `INSERT INTO expenses (user_id, category, merchant, amount_hkd, payment_status, created_at)
       VALUES (?, ?, ?, ?, 'paid', datetime('now'))`
    ).run(TEST_USER_ID, '包裝用品', 'Old Supplier Name', 100);

    const row = await db
      .prepare('SELECT id FROM expense_options WHERE user_id = ? AND type = ? AND value = ?')
      .get(TEST_USER_ID, 'category', '包裝用品') as { id: number };

    const result = await updateManagedOption(TEST_USER_ID, row.id, 'New Category Name');
    expect(result.option?.value).toBe('New Category Name');

    const expense = await db
      .prepare('SELECT category FROM expenses WHERE user_id = ?')
      .get(TEST_USER_ID) as { category: string };
    expect(expense.category).toBe('New Category Name');
  });

  it('adds a new custom option', async () => {
    const result = await addManagedOption(TEST_USER_ID, 'supplier', 'Brand New Supplier');
    expect(result.options).toContain('Brand New Supplier');
  });
});
