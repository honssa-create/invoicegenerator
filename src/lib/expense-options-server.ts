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

async function dbValuesForType(userId: number, type: OptionType): Promise<string[]> {
  const rows = await db
    .prepare('SELECT value FROM expense_options WHERE user_id = ? AND type = ? ORDER BY id')
    .all(userId, type) as { value: string }[];
  return rows.map((r) => r.value);
}

async function isDbAuthoritative(userId: number, type: OptionType): Promise<boolean> {
  const row = await db
    .prepare('SELECT db_authoritative FROM expense_option_settings WHERE user_id = ? AND type = ?')
    .get(userId, type) as { db_authoritative: number } | undefined;
  return Boolean(row?.db_authoritative);
}

async function markDbAuthoritative(userId: number, type: OptionType): Promise<void> {
  await db.prepare(
    'INSERT INTO expense_option_settings (user_id, type, db_authoritative) VALUES (?, ?, 1) ON CONFLICT(user_id, type) DO UPDATE SET db_authoritative = 1'
  ).run(userId, type);
}

async function authoritativeTypes(userId: number): Promise<Set<OptionType>> {
  const rows = (await db
    .prepare('SELECT type FROM expense_option_settings WHERE user_id = ? AND db_authoritative = 1')
    .all(userId)) as { type: string }[];
  const done = new Set<OptionType>();
  for (const row of rows) {
    if (OPTION_TYPES.includes(row.type as OptionType)) {
      done.add(row.type as OptionType);
    }
  }
  return done;
}

/** Merged dropdown values for forms. */
export async function mergedOptions(userId: number, type: OptionType): Promise<string[]> {
  const dbValues = await dbValuesForType(userId, type);
  if (await isDbAuthoritative(userId, type)) {
    return dedupeValues(dbValues);
  }
  return dedupeValues([...DEFAULT_OPTIONS[type], ...dbValues]);
}

/** Ensure built-in defaults exist in DB so settings can edit/delete them per org. */
export async function ensureOptionsSeeded(userId: number): Promise<void> {
  const seeded = await authoritativeTypes(userId);
  if (seeded.size === OPTION_TYPES.length) return;

  const insert = db.prepare(
    'INSERT OR IGNORE INTO expense_options (user_id, type, value) VALUES (?, ?, ?)'
  );
  for (const type of OPTION_TYPES) {
    if (seeded.has(type)) continue;
    for (const value of DEFAULT_OPTIONS[type]) {
      await insert.run(userId, type, value);
    }
    await markDbAuthoritative(userId, type);
  }
}

/** Full managed list (DB rows only) after seeding. */
export async function listManagedOptions(userId: number): Promise<Record<OptionType, ManagedOption[]>> {
  await ensureOptionsSeeded(userId);
  const rows = await db
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

export async function addManagedOption(
  userId: number,
  type: OptionType,
  value: string
): Promise<{ option: ManagedOption | null; options: string[] }> {
  const trimmed = value.trim();
  if (!trimmed) return { option: null, options: await mergedOptions(userId, type) };

  const existing = await mergedOptions(userId, type);
  if (existing.includes(trimmed)) {
    const row = await db
      .prepare('SELECT id, type, value FROM expense_options WHERE user_id = ? AND type = ? AND value = ?')
      .get(userId, type, trimmed) as ManagedOption | undefined;
    return { option: row || null, options: existing };
  }

  const result = await db
    .prepare('INSERT INTO expense_options (user_id, type, value) VALUES (?, ?, ?)')
    .run(userId, type, trimmed);
  const option = await db
    .prepare('SELECT id, type, value FROM expense_options WHERE id = ?')
    .get(result.lastInsertRowid) as ManagedOption;
  return { option, options: await mergedOptions(userId, type) };
}

export async function updateManagedOption(
  userId: number,
  id: number,
  newValue: string
): Promise<{ option: ManagedOption | null; error?: string }> {
  const trimmed = newValue.trim();
  if (!trimmed) return { option: null, error: 'Option value is required' };

  const row = await db
    .prepare('SELECT id, type, value FROM expense_options WHERE id = ? AND user_id = ?')
    .get(id, userId) as ManagedOption | undefined;
  if (!row) return { option: null, error: 'Option not found' };

  const type = row.type as OptionType;
  if (!OPTION_TYPES.includes(type)) return { option: null, error: 'Invalid option type' };

  const duplicate = await db
    .prepare('SELECT 1 FROM expense_options WHERE user_id = ? AND type = ? AND value = ? AND id != ?')
    .get(userId, type, trimmed, id);
  if (duplicate) return { option: null, error: 'This option already exists' };

  const oldValue = row.value;
  const expenseCol = EXPENSE_COLUMN_FOR_TYPE[type];

  await db.transaction(async () => {
    await db.prepare('UPDATE expense_options SET value = ? WHERE id = ? AND user_id = ?').run(
      trimmed,
      id,
      userId
    );
    if (oldValue !== trimmed) {
      await db.prepare(`UPDATE expenses SET ${expenseCol} = ? WHERE user_id = ? AND ${expenseCol} = ?`).run(
        trimmed,
        userId,
        oldValue
      );
    }
  });
  const option = await db
    .prepare('SELECT id, type, value FROM expense_options WHERE id = ?')
    .get(id) as ManagedOption;
  return { option };
}

export async function deleteManagedOption(
  userId: number,
  id: number
): Promise<{ ok: boolean; error?: string }> {
  const row = await db
    .prepare('SELECT id FROM expense_options WHERE id = ? AND user_id = ?')
    .get(id, userId);
  if (!row) return { ok: false, error: 'Option not found' };

  await db.prepare('DELETE FROM expense_options WHERE id = ? AND user_id = ?').run(id, userId);
  return { ok: true };
}
