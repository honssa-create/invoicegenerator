import { AsyncLocalStorage } from 'async_hooks';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { warnIfEphemeralReceiptStorage } from './receipt-storage';
import { warnIfR2Misconfigured } from './r2';
import fs from 'fs';
import path from 'path';
import { assignLegacyDocumentNumbers } from './record-numbering-core';

type Queryable = Pool | PoolClient;

const txStorage = new AsyncLocalStorage<PoolClient>();
/** True only for nested ensureSchema calls that run inside the boot promise. */
const schemaBootAls = new AsyncLocalStorage<boolean>();

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

function databaseUrl(): string {
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    // Build must not require a live database.
    return process.env.DATABASE_URL || 'postgresql://127.0.0.1:5432/invoiceflow_build';
  }
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      'DATABASE_URL is required. Start Postgres (see docker-compose.yml) and set DATABASE_URL in .env.local.'
    );
  }
  return url;
}

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl(),
      max: Number(process.env.PG_POOL_MAX || 10),
      ssl: process.env.PGSSLMODE === 'disable' ? undefined : undefined,
    });
    pool.on('error', (err) => {
      console.error('[InvoiceFlow] Postgres pool error:', err);
    });
  }
  return pool;
}

function client(): Queryable {
  return txStorage.getStore() ?? getPool();
}

/** Convert SQLite `?` placeholders to Postgres `$1…$n`. */
export function convertPlaceholders(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

/** Light dialect fixes for SQL written for SQLite. */
export function adaptSql(sql: string): string {
  let out = sql;
  out = out.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, 'INSERT INTO');
  // Append ON CONFLICT DO NOTHING only when not already present and it's INSERT OR IGNORE style —
  // handled at call sites / via insertIgnore helper. For raw adapted strings that still say OR IGNORE:
  out = out.replace(/\bdatetime\s*\(\s*'now'\s*\)/gi, "to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')");
  out = out.replace(/\bexcluded\./gi, 'EXCLUDED.');
  out = out.replace(/\s+COLLATE\s+NOCASE\b/gi, '');
  // SQLite IFNULL → Postgres COALESCE
  out = out.replace(/\bIFNULL\s*\(/gi, 'COALESCE(');
  // SQLite allows MAX(a,b); Postgres needs GREATEST for scalar max.
  out = out.replace(/\bMAX\s*\(\s*0\s*,/gi, 'GREATEST(0,');
  return out;
}

function needsConflictDoNothing(originalSql: string): boolean {
  return /INSERT\s+OR\s+IGNORE\s+INTO/i.test(originalSql);
}

export interface RunResult {
  lastInsertRowid: number | bigint;
  changes: number;
}

const NO_RETURNING_TABLES = new Set([
  'expense_option_settings',
  'expense_report_sequence',
  'global_record_sequences',
  'rental_debit_note_seq',
  'rental_debit_note_styles',
  'integration_tokens',
  'hub_order_sequences',
  'integration_sync_state',
  'integration_settings',
  'app_migrations',
  'role_permissions',
  'kitchen_settings',
]);

function insertTableName(sql: string): string | null {
  const m = sql.match(/INSERT\s+INTO\s+([a-zA-Z_][a-zA-Z0-9_]*)/i);
  return m ? m[1].toLowerCase() : null;
}

export class PgStatement {
  constructor(private readonly originalSql: string) {}

  private prepared(): { text: string; returningId: boolean } {
    let sql = adaptSql(this.originalSql);
    const insertIgnore = needsConflictDoNothing(this.originalSql);
    if (insertIgnore && !/ON\s+CONFLICT/i.test(sql)) {
      sql = sql.replace(/;?\s*$/, '') + ' ON CONFLICT DO NOTHING';
    }
    const isInsert = /^\s*INSERT\b/i.test(sql);
    const hasReturning = /\bRETURNING\b/i.test(sql);
    const table = insertTableName(sql);
    let returningId = false;
    if (
      isInsert &&
      !hasReturning &&
      !insertIgnore &&
      table &&
      !NO_RETURNING_TABLES.has(table)
    ) {
      sql = sql.replace(/;?\s*$/, '') + ' RETURNING id';
      returningId = true;
    }
    return { text: convertPlaceholders(sql), returningId };
  }

  async get<T extends QueryResultRow = QueryResultRow>(
    ...params: unknown[]
  ): Promise<T | undefined> {
    await ensureSchema();
    const { text } = this.prepared();
    const res = await client().query<T>(text, params);
    return res.rows[0];
  }

  async all<T extends QueryResultRow = QueryResultRow>(...params: unknown[]): Promise<T[]> {
    await ensureSchema();
    const { text } = this.prepared();
    const res = await client().query<T>(text, params);
    return res.rows;
  }

  async run(...params: unknown[]): Promise<RunResult> {
    await ensureSchema();
    const { text, returningId } = this.prepared();
    const res = await client().query(text, params);
    const id = returningId && res.rows[0] && 'id' in res.rows[0] ? Number(res.rows[0].id) : 0;
    return {
      lastInsertRowid: id,
      changes: res.rowCount ?? 0,
    };
  }
}

async function loadSchemaSql(): Promise<string> {
  const schemaPath = path.join(process.cwd(), 'src', 'lib', 'pg-schema.sql');
  return fs.readFileSync(schemaPath, 'utf8');
}

/**
 * Split a SQL script into statements so each can autocommit separately.
 * Running the whole pg-schema.sql as one Query holds AccessExclusiveLock across
 * many tables until the end — concurrent SELECTs that join those tables deadlock
 * (e.g. invoices ↔ reconciliation_records).
 */
export function splitSqlStatements(sql: string): string[] {
  const out: string[] = [];
  let buf = '';
  let i = 0;
  let inSingle = false;
  let inDouble = false;
  let inLineComment = false;
  let inBlockComment = false;
  let dollarTag: string | null = null;

  while (i < sql.length) {
    const c = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      buf += c;
      if (c === '\n') inLineComment = false;
      i += 1;
      continue;
    }
    if (inBlockComment) {
      buf += c;
      if (c === '*' && next === '/') {
        buf += '/';
        i += 2;
        inBlockComment = false;
        continue;
      }
      i += 1;
      continue;
    }
    if (dollarTag !== null) {
      if (c === '$' && sql.startsWith(dollarTag, i)) {
        buf += dollarTag;
        i += dollarTag.length;
        dollarTag = null;
        continue;
      }
      buf += c;
      i += 1;
      continue;
    }
    if (inSingle) {
      buf += c;
      if (c === "'" && next === "'") {
        buf += next;
        i += 2;
        continue;
      }
      if (c === "'") inSingle = false;
      i += 1;
      continue;
    }
    if (inDouble) {
      buf += c;
      if (c === '"') inDouble = false;
      i += 1;
      continue;
    }

    if (c === '-' && next === '-') {
      buf += c + next;
      i += 2;
      inLineComment = true;
      continue;
    }
    if (c === '/' && next === '*') {
      buf += c + next;
      i += 2;
      inBlockComment = true;
      continue;
    }
    if (c === "'") {
      buf += c;
      inSingle = true;
      i += 1;
      continue;
    }
    if (c === '"') {
      buf += c;
      inDouble = true;
      i += 1;
      continue;
    }
    if (c === '$') {
      const rest = sql.slice(i);
      const m = rest.match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
      if (m) {
        dollarTag = m[0];
        buf += dollarTag;
        i += dollarTag.length;
        continue;
      }
    }
    if (c === ';') {
      const stmt = buf.trim();
      if (stmt) out.push(stmt);
      buf = '';
      i += 1;
      continue;
    }
    buf += c;
    i += 1;
  }
  const tail = buf.trim();
  if (tail) out.push(tail);
  return out;
}

async function migrateUnifiedRecordNumberingOnce(): Promise<void> {
  const conn = await getPool().connect();
  try {
    await conn.query('BEGIN');
    await conn.query(`SELECT pg_advisory_xact_lock(72910421)`);
    const done = await conn.query<{ key: string }>(
      `SELECT key FROM app_migrations WHERE key = 'unified_global_record_numbering_v1'`,
    );
    if (done.rows.length) {
      await conn.query('COMMIT');
      return;
    }

    await conn.query(`
      UPDATE invoices
      SET external_invoice_number = invoice_number
      WHERE external_invoice_number IS NULL
        AND (source_platform <> 'manual' OR invoice_number !~ '^[0-9]+$')
    `);

    const invoiceRows = await conn.query<{
      id: number;
      invoice_number: string;
      created_at: string;
    }>(`SELECT id, invoice_number, created_at FROM invoices ORDER BY created_at, id`);
    const quoteRows = await conn.query<{
      id: number;
      quote_number: string;
      created_at: string;
    }>(`SELECT id, quote_number, created_at FROM quotations ORDER BY created_at, id`);
    const orderRows = await conn.query<{ id: number }>(
      `SELECT id FROM orders ORDER BY created_at, id`,
    );

    const invoiceNumbers = assignLegacyDocumentNumbers(
      invoiceRows.rows.map((row) => ({ id: row.id, value: row.invoice_number, created_at: row.created_at })),
    );
    const quoteNumbers = assignLegacyDocumentNumbers(
      quoteRows.rows.map((row) => ({ id: row.id, value: row.quote_number, created_at: row.created_at })),
    );

    // Temporary globally unique values avoid legacy per-user uniqueness collisions while normalizing.
    await conn.query(`UPDATE invoices SET invoice_number = '__legacy_invoice_' || id`);
    await conn.query(`UPDATE quotations SET quote_number = '__legacy_quote_' || id`);

    let maxInvoice = 0;
    for (const [id, serial] of Array.from(invoiceNumbers.entries())) {
      maxInvoice = Math.max(maxInvoice, serial);
      await conn.query(`UPDATE invoices SET invoice_number = $1 WHERE id = $2`, [
        String(serial).padStart(8, '0'),
        id,
      ]);
    }

    let maxQuote = 0;
    for (const [id, serial] of Array.from(quoteNumbers.entries())) {
      maxQuote = Math.max(maxQuote, serial);
      await conn.query(`UPDATE quotations SET quote_number = $1 WHERE id = $2`, [
        String(serial).padStart(8, '0'),
        id,
      ]);
    }

    let orderSerial = 1;
    for (const row of orderRows.rows) {
      await conn.query(`UPDATE orders SET reference_number = $1 WHERE id = $2`, [
        `ORD-${String(orderSerial).padStart(7, '0')}`,
        row.id,
      ]);
      orderSerial += 1;
    }

    const linkedQuotes = await conn.query<{
      id: number;
      fields_json: string | null;
      quote_number: string;
    }>(
      `SELECT o.id, o.fields_json, q.quote_number
       FROM orders o
       JOIN quotations q ON q.id = o.quotation_id`,
    );
    for (const row of linkedQuotes.rows) {
      let fields: Record<string, unknown> = {};
      try {
        fields = row.fields_json ? JSON.parse(row.fields_json) : {};
      } catch {
        fields = {};
      }
      fields.quotation_no = row.quote_number;
      await conn.query(`UPDATE orders SET fields_json = $1 WHERE id = $2`, [
        JSON.stringify(fields),
        row.id,
      ]);
    }

    await conn.query(`
      INSERT INTO global_record_sequences (record_type, next_serial)
      VALUES ('order', $1), ('quotation', $2), ('invoice', $3)
      ON CONFLICT (record_type) DO UPDATE
      SET next_serial = GREATEST(global_record_sequences.next_serial, EXCLUDED.next_serial)
    `, [orderSerial, maxQuote + 1, maxInvoice + 1]);

    await conn.query(`ALTER TABLE orders ALTER COLUMN reference_number SET NOT NULL`);
    await conn.query(`ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_reference_number_format`);
    await conn.query(`
      ALTER TABLE orders
      ADD CONSTRAINT orders_reference_number_format CHECK (reference_number ~ '^ORD-[0-9]{7}$')
    `);
    await conn.query(`ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_number_format`);
    await conn.query(`
      ALTER TABLE invoices
      ADD CONSTRAINT invoices_number_format CHECK (invoice_number ~ '^[0-9]{8}$')
    `);
    await conn.query(`ALTER TABLE quotations DROP CONSTRAINT IF EXISTS quotations_number_format`);
    await conn.query(`
      ALTER TABLE quotations
      ADD CONSTRAINT quotations_number_format CHECK (quote_number ~ '^[0-9]{8}$')
    `);
    await conn.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_reference_number ON orders(reference_number)`);
    await conn.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_number_global ON invoices(invoice_number)`);
    await conn.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_quotations_number_global ON quotations(quote_number)`);
    await conn.query(
      `INSERT INTO app_migrations (key) VALUES ('unified_global_record_numbering_v1') ON CONFLICT DO NOTHING`,
    );
    await conn.query('COMMIT');
  } catch (error) {
    await conn.query('ROLLBACK');
    throw error;
  } finally {
    conn.release();
  }
}

async function migrateOrderStatusesV2Once(): Promise<void> {
  const conn = await getPool().connect();
  try {
    await conn.query('BEGIN');
    await conn.query(`SELECT pg_advisory_xact_lock(72910422)`);
    const done = await conn.query<{ key: string }>(
      `SELECT key FROM app_migrations WHERE key = 'order_status_workflow_v2'`,
    );
    if (done.rows.length) {
      await conn.query('COMMIT');
      return;
    }

    // Product decision: reset every existing order into the new workflow at OPEN.
    await conn.query(`UPDATE orders SET status = 'OPEN'`);
    await conn.query(`ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'OPEN'`);
    await conn.query(
      `INSERT INTO app_migrations (key) VALUES ('order_status_workflow_v2') ON CONFLICT DO NOTHING`,
    );
    await conn.query('COMMIT');
  } catch (error) {
    await conn.query('ROLLBACK');
    throw error;
  } finally {
    conn.release();
  }
}

async function syncGlobalRecordSequences(): Promise<void> {
  await client().query(`
    INSERT INTO global_record_sequences (record_type, next_serial)
    VALUES
      ('order', COALESCE((SELECT MAX(CAST(SUBSTR(reference_number, 5) AS INTEGER)) + 1 FROM orders), 1)),
      ('quotation', COALESCE((SELECT MAX(CAST(quote_number AS INTEGER)) + 1 FROM quotations), 1)),
      ('invoice', COALESCE((SELECT MAX(CAST(invoice_number AS INTEGER)) + 1 FROM invoices), 1))
    ON CONFLICT (record_type) DO UPDATE
    SET next_serial = GREATEST(global_record_sequences.next_serial, EXCLUDED.next_serial)
  `);
}

async function runBootDataFixes(): Promise<void> {
  await migrateUnifiedRecordNumberingOnce();
  await migrateOrderStatusesV2Once();

  // Sequence MAX scans once per DB (not every process cold start).
  const migSeq = await client().query<{ key: string }>(
    `SELECT key FROM app_migrations WHERE key = 'boot_sequence_sync_once_v1'`
  );
  if (!migSeq.rows.length) {
    await syncGlobalRecordSequences();
    await client().query(`
      INSERT INTO expense_report_sequence (id, next_serial) VALUES (1, 1)
      ON CONFLICT (id) DO NOTHING
    `);
    const maxRow = await client().query<{ m: string | null }>(`
      SELECT MAX(CAST(SUBSTR(batch_id, 5) AS INTEGER)) AS m
      FROM expenses
      WHERE batch_id IS NOT NULL AND batch_id LIKE 'EXP-%' AND LENGTH(batch_id) >= 5
    `);
    const maxSerial = Number(maxRow.rows[0]?.m || 0);
    if (maxSerial > 0) {
      await client().query(
        `UPDATE expense_report_sequence SET next_serial = GREATEST(next_serial, $1) WHERE id = 1`,
        [maxSerial + 1]
      );
    }
    await client().query(
      `INSERT INTO app_migrations (key) VALUES ('boot_sequence_sync_once_v1') ON CONFLICT DO NOTHING`
    );
  } else {
    await client().query(`
      INSERT INTO expense_report_sequence (id, next_serial) VALUES (1, 1)
      ON CONFLICT (id) DO NOTHING
    `);
  }

  // Normalize utility billing mode labels (idempotent).
  await client().query(`
    UPDATE rental_units SET utility_billing_mode = 'company_shared_meter'
    WHERE utility_billing_mode = 'company_proxy'
  `);
  await client().query(`
    UPDATE rental_tenants SET utility_billing_mode = 'company_shared_meter'
    WHERE utility_billing_mode = 'company_proxy'
  `);

  // Purge expired trash.
  await client().query(`DELETE FROM deleted_records WHERE expires_at < to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')`);

  // Fix legacy permission section key (hyphen → underscore).
  await client().query(`
    UPDATE role_permissions SET section = 'kitchen_prep'
    WHERE section = 'kitchen-prep'
  `);
  // Drop obsolete role seeds (staff/viewer) and unused admin rows from the old boot path.
  // Admin permissions are always DEFAULT_ROLE_PERMISSIONS; operator/accountant are seeded below.
  await client().query(`DELETE FROM role_permissions WHERE role IN ('staff', 'viewer', 'admin')`);

  // Seed role_permissions for operator/accountant when empty (canonical source: permissions-server).
  const { seedRolePermissionsIfEmpty } = await import('./permissions-server');
  await seedRolePermissionsIfEmpty();

  // Allow kitchen_prep_orders.status = inactive (one-time constraint refresh).
  const mig = await client().query<{ key: string }>(
    `SELECT key FROM app_migrations WHERE key = 'kitchen_prep_status_inactive'`
  );
  if (!mig.rows.length) {
    await client().query(`
      ALTER TABLE kitchen_prep_orders DROP CONSTRAINT IF EXISTS kitchen_prep_orders_status_check
    `);
    await client().query(`
      ALTER TABLE kitchen_prep_orders
        ADD CONSTRAINT kitchen_prep_orders_status_check
        CHECK (status IN ('inactive', 'scheduled', 'in_prep', 'completed'))
    `);
    await client().query(
      `INSERT INTO app_migrations (key) VALUES ('kitchen_prep_status_inactive') ON CONFLICT DO NOTHING`
    );
  }

  // Allow kitchen_prep_orders.order_type = restock (補充存貨).
  const migType = await client().query<{ key: string }>(
    `SELECT key FROM app_migrations WHERE key = 'kitchen_prep_order_type_restock'`
  );
  if (!migType.rows.length) {
    await client().query(`
      ALTER TABLE kitchen_prep_orders DROP CONSTRAINT IF EXISTS kitchen_prep_orders_order_type_check
    `);
    await client().query(`
      ALTER TABLE kitchen_prep_orders
        ADD CONSTRAINT kitchen_prep_orders_order_type_check
        CHECK (order_type IN ('daily', 'wedding', 'restock'))
    `);
    await client().query(
      `INSERT INTO app_migrations (key) VALUES ('kitchen_prep_order_type_restock') ON CONFLICT DO NOTHING`
    );
  }

  // Reconciliation approval workflow: Pending Approval + confidence / suggestion columns.
  const migRecon = await client().query<{ key: string }>(
    `SELECT key FROM app_migrations WHERE key = 'reconciliation_approval_workflow_v1'`
  );
  if (!migRecon.rows.length) {
    await client().query(`
      ALTER TABLE reconciliation_records DROP CONSTRAINT IF EXISTS reconciliation_records_status_check
    `);
    await client().query(`
      ALTER TABLE reconciliation_records
        ADD CONSTRAINT reconciliation_records_status_check
        CHECK (status IN ('Unmatched', 'Pending Approval', 'Matched', 'Discrepancy'))
    `);
    await client().query(`ALTER TABLE reconciliation_records ADD COLUMN IF NOT EXISTS confidence TEXT`);
    await client().query(`ALTER TABLE reconciliation_records ADD COLUMN IF NOT EXISTS suggested_order_id INTEGER`);
    await client().query(`ALTER TABLE reconciliation_records ADD COLUMN IF NOT EXISTS suggested_invoice_id INTEGER`);
    await client().query(`ALTER TABLE reconciliation_records ADD COLUMN IF NOT EXISTS candidate_order_ids_json TEXT`);
    await client().query(`ALTER TABLE reconciliation_records ADD COLUMN IF NOT EXISTS approved_by TEXT`);
    await client().query(`ALTER TABLE reconciliation_records ADD COLUMN IF NOT EXISTS approved_at TEXT`);
    await client().query(`
      ALTER TABLE reconciliation_records DROP CONSTRAINT IF EXISTS reconciliation_records_confidence_check
    `);
    await client().query(`
      ALTER TABLE reconciliation_records
        ADD CONSTRAINT reconciliation_records_confidence_check
        CHECK (confidence IS NULL OR confidence IN ('high', 'medium'))
    `);
    await client().query(
      `INSERT INTO app_migrations (key) VALUES ('reconciliation_approval_workflow_v1') ON CONFLICT DO NOTHING`
    );
  }

  // Manual payment entry: source=manual + receipt_path.
  const migReconManual = await client().query<{ key: string }>(
    `SELECT key FROM app_migrations WHERE key = 'reconciliation_manual_entry_v1'`
  );
  if (!migReconManual.rows.length) {
    await client().query(`ALTER TABLE reconciliation_records ADD COLUMN IF NOT EXISTS receipt_path TEXT`);
    await client().query(`
      ALTER TABLE reconciliation_records DROP CONSTRAINT IF EXISTS reconciliation_records_source_check
    `);
    await client().query(`
      ALTER TABLE reconciliation_records
        ADD CONSTRAINT reconciliation_records_source_check
        CHECK (source IN ('yedpay', 'bank_upload', 'manual'))
    `);
    await client().query(
      `INSERT INTO app_migrations (key) VALUES ('reconciliation_manual_entry_v1') ON CONFLICT DO NOTHING`
    );
  }

  await client().query(`ALTER TABLE reconciliation_records ADD COLUMN IF NOT EXISTS created_by TEXT`);

  // Extra manual payment methods: 現金 / 支票 / 銀行轉帳.
  const migReconMethods = await client().query<{ key: string }>(
    `SELECT key FROM app_migrations WHERE key = 'reconciliation_payment_methods_v2'`
  );
  if (!migReconMethods.rows.length) {
    await client().query(`
      ALTER TABLE reconciliation_records DROP CONSTRAINT IF EXISTS reconciliation_records_payment_method_check
    `);
    await client().query(`
      ALTER TABLE reconciliation_records
        ADD CONSTRAINT reconciliation_records_payment_method_check
        CHECK (payment_method IN ('Yedpay', 'FPS', 'Payme', '現金', '支票', '銀行轉帳'))
    `);
    await client().query(
      `INSERT INTO app_migrations (key) VALUES ('reconciliation_payment_methods_v2') ON CONFLICT DO NOTHING`
    );
  }

  // Drop unused legacy kitchen/order activity tables (replaced by gift-box movements + activity_logs).
  const migDropLegacy = await client().query<{ key: string }>(
    `SELECT key FROM app_migrations WHERE key = 'drop_legacy_kitchen_and_order_activities_v1'`
  );
  if (!migDropLegacy.rows.length) {
    await client().query(`DROP TABLE IF EXISTS order_activities CASCADE`);
    await client().query(`DROP TABLE IF EXISTS kitchen_daily_orders CASCADE`);
    await client().query(`DROP TABLE IF EXISTS kitchen_batches CASCADE`);
    await client().query(
      `INSERT INTO app_migrations (key) VALUES ('drop_legacy_kitchen_and_order_activities_v1') ON CONFLICT DO NOTHING`
    );
  }

  // Needed for rental charge upsert ON CONFLICT; ignore if duplicate rows already exist.
  const migChargeUnique = await client().query<{ key: string }>(
    `SELECT key FROM app_migrations WHERE key = 'rental_charge_items_upsert_unique_v1'`
  );
  if (!migChargeUnique.rows.length) {
    try {
      await client().query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_rental_charge_items_upsert
        ON rental_charge_items(user_id, unit_id, billing_period, charge_type)
      `);
    } catch (err) {
      console.error('[InvoiceFlow] Could not create rental_charge_items unique index:', err);
    }
    await client().query(
      `INSERT INTO app_migrations (key) VALUES ('rental_charge_items_upsert_unique_v1') ON CONFLICT DO NOTHING`
    );
  }
}

export async function ensureSchema(): Promise<void> {
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  // Nested call from boot helpers (e.g. seedRolePermissionsIfEmpty → db.prepare) must not
  // await the in-flight schemaReady promise — that deadlocks login and every first DB use.
  if (schemaBootAls.getStore()) {
    return;
  }
  if (!schemaReady) {
    schemaReady = schemaBootAls
      .run(true, async () => {
        const sql = await loadSchemaSql();
        // Autocommit each statement so AccessExclusiveLock is released between ALTERs.
        // A single multi-statement Query holds locks across invoices + reconciliation_records
        // and deadlocks concurrent JOINs (Postgres 40P01).
        for (const stmt of splitSqlStatements(sql)) {
          await getPool().query(stmt);
        }
        await runBootDataFixes();
        warnIfEphemeralReceiptStorage();
        warnIfR2Misconfigured();
      })
      .catch((err) => {
        schemaReady = null;
        throw err;
      });
  }
  await schemaReady;
}

const db = {
  prepare(sql: string) {
    return new PgStatement(sql);
  },

  async exec(sql: string): Promise<void> {
    await ensureSchema();
    const adapted = adaptSql(sql);
    await client().query(adapted);
  },

  /**
   * Async transaction. Call as: `await db.transaction(async () => { ... })`
   * (unlike better-sqlite3 which returned a runner function).
   */
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    await ensureSchema();
    const existing = txStorage.getStore();
    if (existing) {
      return fn();
    }
    const conn = await getPool().connect();
    try {
      await conn.query('BEGIN');
      const result = await txStorage.run(conn, fn);
      await conn.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await conn.query('ROLLBACK');
      } catch {
        /* ignore */
      }
      throw err;
    } finally {
      conn.release();
    }
  },
};

export default db;
export { getPool };
