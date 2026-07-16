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

beforeEach(() => {
  db.prepare('DELETE FROM expense_options WHERE user_id = ?').run(TEST_USER_ID);
  db.prepare('DELETE FROM expense_option_settings WHERE user_id = ?').run(TEST_USER_ID);
  db.prepare('DELETE FROM expenses WHERE user_id = ?').run(TEST_USER_ID);
  db.prepare('DELETE FROM users WHERE id = ?').run(TEST_USER_ID);
  db.prepare('INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)').run(
    TEST_USER_ID,
    `test-${TEST_USER_ID}@example.com`,
    'hash',
    'Test User'
  );
});

describe('expense-options-server', () => {
  it('merges defaults with custom values before seeding', () => {
    db.prepare('INSERT INTO expense_options (user_id, type, value) VALUES (?, ?, ?)').run(
      TEST_USER_ID,
      'supplier',
      'My Custom Supplier'
    );
    const options = mergedOptions(TEST_USER_ID, 'supplier');
    expect(options).toContain('My Custom Supplier');
    expect(options.length).toBeGreaterThan(1);
  });

  it('uses DB only after seeding and allows deleting defaults', () => {
    ensureOptionsSeeded(TEST_USER_ID);
    const before = mergedOptions(TEST_USER_ID, 'platform');
    expect(before).toContain('淘寶');

    const row = db
      .prepare('SELECT id FROM expense_options WHERE user_id = ? AND type = ? AND value = ?')
      .get(TEST_USER_ID, 'platform', '淘寶') as { id: number };
    deleteManagedOption(TEST_USER_ID, row.id);

    const after = mergedOptions(TEST_USER_ID, 'platform');
    expect(after).not.toContain('淘寶');
  });

  it('renames option and updates matching expenses', () => {
    ensureOptionsSeeded(TEST_USER_ID);
    db.prepare(
      `INSERT INTO expenses (user_id, category, merchant, amount_hkd, payment_status, created_at)
       VALUES (?, ?, ?, ?, 'paid', datetime('now'))`
    ).run(TEST_USER_ID, '包裝用品', 'Old Supplier Name', 100);

    const row = db
      .prepare('SELECT id FROM expense_options WHERE user_id = ? AND type = ? AND value = ?')
      .get(TEST_USER_ID, 'category', '包裝用品') as { id: number };

    const result = updateManagedOption(TEST_USER_ID, row.id, 'New Category Name');
    expect(result.option?.value).toBe('New Category Name');

    const expense = db
      .prepare('SELECT category FROM expenses WHERE user_id = ?')
      .get(TEST_USER_ID) as { category: string };
    expect(expense.category).toBe('New Category Name');
  });

  it('adds a new custom option', () => {
    const result = addManagedOption(TEST_USER_ID, 'supplier', 'Brand New Supplier');
    expect(result.options).toContain('Brand New Supplier');
  });
});
