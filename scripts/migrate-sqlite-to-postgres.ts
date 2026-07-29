/**
 * One-time SQLite → PostgreSQL data migration.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... SQLITE_PATH=/path/to/invoices.db npx tsx scripts/migrate-sqlite-to-postgres.ts
 *
 * Tips for Railway public proxy (*.proxy.rlwy.net):
 * - Prefer the internal URL when running from a Railway shell (faster, stabler).
 * - This script batches inserts and commits per table to avoid proxy idle kills.
 *
 * Requires better-sqlite3 (devDependency) and pg.
 */
import Database from 'better-sqlite3';
import { Pool, type PoolClient } from 'pg';
import fs from 'fs';

const sqlitePath = process.env.SQLITE_PATH || 'data/invoices.db';
const databaseUrl = process.env.DATABASE_URL;
const BATCH_SIZE = Number(process.env.MIGRATE_BATCH_SIZE || 100);

if (!databaseUrl) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}
if (!fs.existsSync(sqlitePath)) {
  console.error(`SQLite file not found: ${sqlitePath}`);
  process.exit(1);
}

const useSsl =
  /rlwy\.net|railway\.(app|internal)/i.test(databaseUrl) ||
  process.env.PGSSLMODE === 'require';

const sqlite = new Database(sqlitePath, { readonly: true });
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  connectionTimeoutMillis: 60_000,
  idleTimeoutMillis: 120_000,
  keepAlive: true,
  max: 1,
});

pool.on('error', (err) => {
  console.error('[migrate] pool error:', err.message);
});

type PgClient = PoolClient;

async function withClient<T>(fn: (client: PgClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

async function tableColumns(client: PgClient, table: string): Promise<string[]> {
  const res = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [table]
  );
  return res.rows.map((r) => r.column_name as string);
}

async function listSqliteTables(): Promise<string[]> {
  const rows = sqlite
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
    .all() as { name: string }[];
  return rows.map((r) => r.name);
}

function rowValues(table: string, cols: string[], row: Record<string, unknown>): unknown[] {
  return cols.map((c) => {
    if (table === 'rental_units' && c === 'current_lease_id') return null;
    return row[c] ?? null;
  });
}

async function migrateTable(client: PgClient, table: string): Promise<number> {
  const pgCols = await tableColumns(client, table);
  if (!pgCols.length) {
    console.warn(`  skip ${table}: not in Postgres schema`);
    return 0;
  }
  const sqliteInfo = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  const sqliteCols = sqliteInfo.map((c) => c.name).filter((c) => pgCols.includes(c));
  if (!sqliteCols.length) return 0;

  const rows = sqlite.prepare(`SELECT ${sqliteCols.map((c) => `"${c}"`).join(', ')} FROM "${table}"`).all() as Record<
    string,
    unknown
  >[];
  if (!rows.length) return 0;

  const colList = sqliteCols.map((c) => `"${c}"`).join(', ');
  let n = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const params: unknown[] = [];
    const valueGroups: string[] = [];
    let p = 1;
    for (const row of chunk) {
      const vals = rowValues(table, sqliteCols, row);
      valueGroups.push(`(${vals.map(() => `$${p++}`).join(', ')})`);
      params.push(...vals);
    }
    const insertSql = `INSERT INTO "${table}" (${colList}) VALUES ${valueGroups.join(', ')} ON CONFLICT DO NOTHING`;
    await client.query(insertSql, params);
    n += chunk.length;
  }
  return n;
}

async function resetIdentities(client: PgClient): Promise<void> {
  const res = await client.query<{ table_name: string }>(`
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND is_identity = 'YES'
      AND column_name = 'id'
  `);
  for (const row of res.rows) {
    await client.query(
      `SELECT setval(pg_get_serial_sequence($1, 'id'), COALESCE((SELECT MAX(id) FROM "${row.table_name}"), 1), true)`,
      [row.table_name]
    );
  }
}

const TABLE_ORDER = [
  'users',
  'app_migrations',
  'role_permissions',
  'customers',
  'expense_report_sequence',
  'expense_options',
  'expense_option_settings',
  'expenses',
  'expense_receipts',
  'orders',
  'order_files',
  'order_activities',
  'activity_logs',
  'quotations',
  'quotation_items',
  'quotation_files',
  'invoices',
  'invoice_items',
  'invoice_files',
  'other_income',
  'kitchen_finished',
  'kitchen_raw',
  'kitchen_daily_orders',
  'kitchen_batches',
  'kitchen_prep_orders',
  'inbound_shipments',
  'rental_tenants',
  'rental_units',
  'rental_leases',
  'rental_lease_documents',
  'rental_document_templates',
  'rental_records',
  'rental_payment_receipts',
  'rental_activity_logs',
  'rental_charge_items',
  'rental_payments',
  'rental_payment_allocations',
  'rental_debit_note_seq',
  'rental_debit_note_styles',
  'reconciliation_records',
  'integration_tokens',
  'hub_order_sequences',
  'integration_sync_state',
  'integration_settings',
  'deleted_records',
];

async function main() {
  const schema = fs.readFileSync('src/lib/pg-schema.sql', 'utf8');
  const sqliteTables = new Set(await listSqliteTables());
  const ordered = [
    ...TABLE_ORDER.filter((t) => sqliteTables.has(t)),
    ...[...sqliteTables].filter((t) => t !== 'sqlite_sequence' && !TABLE_ORDER.includes(t)),
  ];

  console.log(`SSL: ${useSsl ? 'on' : 'off'}; batch size: ${BATCH_SIZE}`);
  console.log('Applying schema…');
  await withClient(async (client) => {
    await client.query(schema);
  });

  console.log(`Migrating ${ordered.length} tables from ${sqlitePath}…`);
  for (const table of ordered) {
    await withClient(async (client) => {
      await client.query('BEGIN');
      try {
        const n = await migrateTable(client, table);
        await client.query('COMMIT');
        if (n) console.log(`  ${table}: ${n} rows`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  ${table} FAILED:`, err);
        throw err;
      }
    });
  }

  await withClient(async (client) => {
    await client.query('BEGIN');
    try {
      if (sqliteTables.has('rental_units') && sqliteTables.has('rental_leases')) {
        const rows = sqlite
          .prepare(`SELECT id, current_lease_id FROM rental_units WHERE current_lease_id IS NOT NULL`)
          .all() as { id: number; current_lease_id: number }[];
        for (const row of rows) {
          await client.query(`UPDATE rental_units SET current_lease_id = $1 WHERE id = $2`, [
            row.current_lease_id,
            row.id,
          ]);
        }
      }

      for (const key of [
        'orders_org_owner_v1',
        'order_type_honour_dingzhi_v1',
        'order_type_nestiee_v1',
        'expense_numbering_v2',
      ]) {
        await client.query(`INSERT INTO app_migrations (key) VALUES ($1) ON CONFLICT DO NOTHING`, [key]);
      }

      await resetIdentities(client);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  });

  console.log('Done.');
  await pool.end();
  sqlite.close();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
  try {
    sqlite.close();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
