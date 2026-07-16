import db from '@/lib/db';
import { DEFAULT_OPTIONS, OPTION_TYPES, type OptionType } from '@/lib/expenses';

export type ManagedOption = {
  id: number;
  type: OptionType;
  value: string;
};

const EXPENSE_COLUMN_FOR_TYPE: Record<OptionType, string> = {
  category: 'category',
  platform: 'platform',
  supplier: 'merchant',
  payment_method: 'payment_method',
};

function dedupeValues(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const v of values) {
    const key = v.trim();
    if (key && !seen.has(key)) {
      seen.add(key);
      result.push(key);
    }
  }
  return result;
}

function dbValuesForType(userId: number, type: OptionType): string[] {
  const rows = db
    .prepare('SELECT value FROM expense_options WHERE user_id = ? AND type = ? ORDER BY id')
    .all(userId, type) as { value: string }[];
  return rows.map((r) => r.value);
}

function isDbAuthoritative(userId: number, type: OptionType): boolean {
  const row = db
    .prepare('SELECT db_authoritative FROM expense_option_settings WHERE user_id = ? AND type = ?')
    .get(userId, type) as { db_authoritative: number } | undefined;
  return Boolean(row?.db_authoritative);
}

function markDbAuthoritative(userId: number, type: OptionType): void {
  db.prepare(
    'INSERT INTO expense_option_settings (user_id, type, db_authoritative) VALUES (?, ?, 1) ON CONFLICT(user_id, type) DO UPDATE SET db_authoritative = 1'
  ).run(userId, type);
}

/** Merged dropdown values for forms. */
export function mergedOptions(userId: number, type: OptionType): string[] {
  const dbValues = dbValuesForType(userId, type);
  if (isDbAuthoritative(userId, type)) {
    return dedupeValues(dbValues);
  }
  return dedupeValues([...DEFAULT_OPTIONS[type], ...dbValues]);
}

/** Ensure built-in defaults exist in DB so settings can edit/delete them per org. */
export function ensureOptionsSeeded(userId: number): void {
  const insert = db.prepare(
    'INSERT OR IGNORE INTO expense_options (user_id, type, value) VALUES (?, ?, ?)'
  );
  for (const type of OPTION_TYPES) {
    for (const value of DEFAULT_OPTIONS[type]) {
      insert.run(userId, type, value);
    }
    markDbAuthoritative(userId, type);
  }
}

/** Full managed list (DB rows only) after seeding. */
export function listManagedOptions(userId: number): Record<OptionType, ManagedOption[]> {
  ensureOptionsSeeded(userId);
  const rows = db
    .prepare(
      'SELECT id, type, value FROM expense_options WHERE user_id = ? ORDER BY type, id'
    )
    .all(userId) as ManagedOption[];

  const grouped: Record<OptionType, ManagedOption[]> = {
    payment_method: [],
    category: [],
    platform: [],
    supplier: [],
  };
  for (const row of rows) {
    if (OPTION_TYPES.includes(row.type as OptionType)) {
      grouped[row.type as OptionType].push(row);
    }
  }
  return grouped;
}

export function addManagedOption(
  userId: number,
  type: OptionType,
  value: string
): { option: ManagedOption | null; options: string[] } {
  const trimmed = value.trim();
  if (!trimmed) return { option: null, options: mergedOptions(userId, type) };

  const existing = mergedOptions(userId, type);
  if (existing.includes(trimmed)) {
    const row = db
      .prepare('SELECT id, type, value FROM expense_options WHERE user_id = ? AND type = ? AND value = ?')
      .get(userId, type, trimmed) as ManagedOption | undefined;
    return { option: row || null, options: existing };
  }

  const result = db
    .prepare('INSERT INTO expense_options (user_id, type, value) VALUES (?, ?, ?)')
    .run(userId, type, trimmed);
  const option = db
    .prepare('SELECT id, type, value FROM expense_options WHERE id = ?')
    .get(result.lastInsertRowid) as ManagedOption;
  return { option, options: mergedOptions(userId, type) };
}

export function updateManagedOption(
  userId: number,
  id: number,
  newValue: string
): { option: ManagedOption | null; error?: string } {
  const trimmed = newValue.trim();
  if (!trimmed) return { option: null, error: 'Option value is required' };

  const row = db
    .prepare('SELECT id, type, value FROM expense_options WHERE id = ? AND user_id = ?')
    .get(id, userId) as ManagedOption | undefined;
  if (!row) return { option: null, error: 'Option not found' };

  const type = row.type as OptionType;
  if (!OPTION_TYPES.includes(type)) return { option: null, error: 'Invalid option type' };

  const duplicate = db
    .prepare('SELECT 1 FROM expense_options WHERE user_id = ? AND type = ? AND value = ? AND id != ?')
    .get(userId, type, trimmed, id);
  if (duplicate) return { option: null, error: 'This option already exists' };

  const oldValue = row.value;
  const expenseCol = EXPENSE_COLUMN_FOR_TYPE[type];

  const tx = db.transaction(() => {
    db.prepare('UPDATE expense_options SET value = ? WHERE id = ? AND user_id = ?').run(
      trimmed,
      id,
      userId
    );
    if (oldValue !== trimmed) {
      db.prepare(`UPDATE expenses SET ${expenseCol} = ? WHERE user_id = ? AND ${expenseCol} = ?`).run(
        trimmed,
        userId,
        oldValue
      );
    }
  });
  tx();

  const option = db
    .prepare('SELECT id, type, value FROM expense_options WHERE id = ?')
    .get(id) as ManagedOption;
  return { option };
}

export function deleteManagedOption(
  userId: number,
  id: number
): { ok: boolean; error?: string } {
  const row = db
    .prepare('SELECT id FROM expense_options WHERE id = ? AND user_id = ?')
    .get(id, userId);
  if (!row) return { ok: false, error: 'Option not found' };

  db.prepare('DELETE FROM expense_options WHERE id = ? AND user_id = ?').run(id, userId);
  return { ok: true };
}
