import { ensureSchema, getPool } from './db';

/** Tables never truncated by clearDatabaseExceptUsers. */
const KEEP_TABLES = new Set(['users', 'integration_settings']);

/** True when ALLOW_CLEAR_DB is 1 / true / yes (case-insensitive). */
export function isClearDbAllowed(): boolean {
  const v = process.env.ALLOW_CLEAR_DB?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/**
 * Truncate every public table except `users` and `integration_settings`,
 * then re-seed singleton rows (record sequences + role permissions) so the app keeps working.
 *
 * Guarded by ALLOW_CLEAR_DB — throws if the env flag is not set.
 */
export async function clearDatabaseExceptUsers(): Promise<{ truncated: string[] }> {
  if (!isClearDbAllowed()) {
    throw new Error('CLEAR_DB_DISABLED: set ALLOW_CLEAR_DB=true to enable clearing the database');
  }

  await ensureSchema();
  const pool = getPool();

  const { rows } = await pool.query<{ tablename: string }>(
    `SELECT tablename
     FROM pg_tables
     WHERE schemaname = 'public'
     ORDER BY tablename`
  );

  const tables = rows.map((r) => r.tablename).filter((t) => !KEEP_TABLES.has(t));
  if (tables.length === 0) return { truncated: [] };

  const list = tables.map((t) => `"${t.replace(/"/g, '""')}"`).join(', ');
  await pool.query(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);

  await pool.query(`
    INSERT INTO expense_report_sequence (id, next_serial) VALUES (1, 1)
    ON CONFLICT (id) DO NOTHING
  `);
  await pool.query(`
    INSERT INTO global_record_sequences (record_type, next_serial)
    VALUES ('order', 1), ('quotation', 1), ('invoice', 1)
    ON CONFLICT (record_type) DO NOTHING
  `);
  const { seedRolePermissionsIfEmpty } = await import('./permissions-server');
  await seedRolePermissionsIfEmpty();

  return { truncated: tables };
}
