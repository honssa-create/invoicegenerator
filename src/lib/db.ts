import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'invoices.db');

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    company_name TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    zip TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    customer_id INTEGER NOT NULL,
    invoice_number TEXT NOT NULL,
    status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'sent', 'paid', 'overdue')),
    issue_date TEXT NOT NULL,
    due_date TEXT NOT NULL,
    tax_rate REAL DEFAULT 0,
    notes TEXT,
    terms TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
    UNIQUE(user_id, invoice_number)
  );

  CREATE TABLE IF NOT EXISTS invoice_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL,
    description TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 1,
    unit_price REAL NOT NULL DEFAULT 0,
    amount REAL NOT NULL DEFAULT 0,
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    category TEXT NOT NULL DEFAULT 'other',
    merchant TEXT,
    amount_hkd REAL,
    amount_rmb REAL,
    paid_date TEXT,
    order_no TEXT,
    platform TEXT,
    notes TEXT,
    payment_status TEXT DEFAULT 'unpaid' CHECK(payment_status IN ('unpaid', 'pending', 'paid')),
    receipt_path TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_customers_user ON customers(user_id);
  CREATE INDEX IF NOT EXISTS idx_invoices_user ON invoices(user_id);
  CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);
  CREATE INDEX IF NOT EXISTS idx_expenses_user ON expenses(user_id);
`);

// Migration: add sequential receipt numbers to the expenses table.
const expenseColumns = db.prepare('PRAGMA table_info(expenses)').all() as { name: string }[];
if (!expenseColumns.some((c) => c.name === 'receipt_no')) {
  db.exec('ALTER TABLE expenses ADD COLUMN receipt_no TEXT');
}

// Receipt numbers use the EXP-YYYYMM-XXX format, where YYYYMM is derived from the
// expense date. Renumber any records that are missing a number or still use an
// older format so historical/backfilled data slots into the right month.
const NEW_NUMBER_RE = /^EXP-\d{6}-\d{3,}$/;
const numberYm = (row: { paid_date: string | null; created_at: string | null }) => {
  const src = row.paid_date && /^\d{4}-\d{2}/.test(row.paid_date) ? row.paid_date : row.created_at || '';
  const ym = src.slice(0, 7);
  return ym ? ym.replace('-', '') : new Date().toISOString().slice(0, 7).replace('-', '');
};

const numberRows = db
  .prepare('SELECT id, user_id, receipt_no, paid_date, created_at FROM expenses')
  .all() as { id: number; user_id: number; receipt_no: string | null; paid_date: string | null; created_at: string | null }[];

const needsNumber = numberRows.filter((r) => !r.receipt_no || !NEW_NUMBER_RE.test(r.receipt_no));

if (needsNumber.length) {
  const counters = new Map<string, number>();
  // Seed counters from records already using the new format.
  for (const r of numberRows) {
    if (r.receipt_no && NEW_NUMBER_RE.test(r.receipt_no)) {
      const key = `${r.user_id}-${r.receipt_no.slice(4, 10)}`;
      const serial = parseInt(r.receipt_no.slice(11), 10);
      counters.set(key, Math.max(counters.get(key) || 0, serial));
    }
  }

  const sortDate = (r: { paid_date: string | null; created_at: string | null }) =>
    r.paid_date || r.created_at || '';
  needsNumber.sort(
    (a, b) =>
      a.user_id - b.user_id ||
      numberYm(a).localeCompare(numberYm(b)) ||
      sortDate(a).localeCompare(sortDate(b)) ||
      a.id - b.id
  );

  const update = db.prepare('UPDATE expenses SET receipt_no = ? WHERE id = ?');
  const backfill = db.transaction(() => {
    for (const row of needsNumber) {
      const ym = numberYm(row);
      const key = `${row.user_id}-${ym}`;
      const next = (counters.get(key) || 0) + 1;
      counters.set(key, next);
      update.run(`EXP-${ym}-${String(next).padStart(3, '0')}`, row.id);
    }
  });
  backfill();
}

// Order Management module tables (ClickUp-style order detail).
db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    po_number TEXT,
    name TEXT,
    description TEXT,
    status TEXT DEFAULT '草稿',
    delivery_date TEXT,
    customer_email TEXT,
    phone TEXT,
    shipping_address TEXT,
    notes TEXT,
    fields_json TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS order_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    path TEXT NOT NULL,
    original_name TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS order_activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    kind TEXT NOT NULL DEFAULT 'comment',
    author TEXT,
    body TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
  CREATE INDEX IF NOT EXISTS idx_order_files_order ON order_files(order_id);
  CREATE INDEX IF NOT EXISTS idx_order_activities_order ON order_activities(order_id);
`);

// Carton count + quotation link on orders (for delivery notes / source quote tracking).
{
  const orderCols = db.prepare('PRAGMA table_info(orders)').all() as { name: string }[];
  if (!orderCols.some((c) => c.name === 'carton_count')) {
    db.exec('ALTER TABLE orders ADD COLUMN carton_count TEXT');
  }
  if (!orderCols.some((c) => c.name === 'quotation_id')) {
    db.exec('ALTER TABLE orders ADD COLUMN quotation_id INTEGER');
  }
}

// Unified activity log shared by Orders, Invoices and Quotations (ClickUp-style feed).
db.exec(`
  CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    kind TEXT NOT NULL DEFAULT 'comment',
    author TEXT,
    body TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_activity_logs_entity ON activity_logs(entity_type, entity_id);
`);

// One-time backfill: fold legacy order_activities into the unified table.
try {
  const legacyCount = (db.prepare("SELECT COUNT(*) c FROM order_activities").get() as { c: number }).c;
  const migratedOrders = (db
    .prepare("SELECT COUNT(*) c FROM activity_logs WHERE entity_type = 'order'")
    .get() as { c: number }).c;
  if (legacyCount > 0 && migratedOrders === 0) {
    db.exec(`
      INSERT INTO activity_logs (entity_type, entity_id, user_id, kind, author, body, created_at)
      SELECT 'order', order_id, user_id, kind, author, body, created_at FROM order_activities
    `);
  }
} catch {
  // order_activities may not exist on a very old DB — ignore.
}

// Invoice ↔ Order relation + reminder tracking.
{
  const invoiceCols = db.prepare('PRAGMA table_info(invoices)').all() as { name: string }[];
  if (!invoiceCols.some((c) => c.name === 'order_id')) {
    db.exec('ALTER TABLE invoices ADD COLUMN order_id INTEGER');
  }
  if (!invoiceCols.some((c) => c.name === 'last_reminder_at')) {
    db.exec('ALTER TABLE invoices ADD COLUMN last_reminder_at TEXT');
  }
}

// Quotation module.
db.exec(`
  CREATE TABLE IF NOT EXISTS quotations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    customer_id INTEGER,
    quote_number TEXT NOT NULL,
    status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'sent', 'approved', 'rejected')),
    issue_date TEXT NOT NULL,
    valid_until TEXT,
    tax_rate REAL DEFAULT 0,
    notes TEXT,
    terms TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS quotation_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quotation_id INTEGER NOT NULL,
    description TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 1,
    unit_price REAL NOT NULL DEFAULT 0,
    amount REAL NOT NULL DEFAULT 0,
    FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_quotations_user ON quotations(user_id);
  CREATE INDEX IF NOT EXISTS idx_quotation_items_quotation ON quotation_items(quotation_id);
`);

// Other Income (non-product revenue) for the Cash Flow dashboard.
db.exec(`
  CREATE TABLE IF NOT EXISTS other_income (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    category TEXT,
    txn_date TEXT,
    amount REAL NOT NULL DEFAULT 0,
    account TEXT,
    remarks TEXT,
    receipt_path TEXT,
    verified INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_other_income_user ON other_income(user_id);
`);

// Integrated Kitchen Scheduling & Two-Tier Inventory System.
db.exec(`
  CREATE TABLE IF NOT EXISTS kitchen_finished (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    sku TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    UNIQUE(user_id, sku),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS kitchen_raw (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    unit TEXT,
    total_stock REAL NOT NULL DEFAULT 0,
    allocated_stock REAL NOT NULL DEFAULT 0,
    UNIQUE(user_id, name),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS kitchen_daily_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    source TEXT DEFAULT 'manual',
    customer TEXT,
    sku TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT '無現貨 (Out of Stock)',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS kitchen_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    flavor TEXT NOT NULL,
    capacity TEXT NOT NULL,
    brewing_date TEXT,
    bottle_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'scheduled',
    created_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_kitchen_daily_user ON kitchen_daily_orders(user_id);
  CREATE INDEX IF NOT EXISTS idx_kitchen_batches_user ON kitchen_batches(user_id);
`);

// Kitchen Prep (廚房備料系統) — stewing ingredient calculator.
db.exec(`
  CREATE TABLE IF NOT EXISTS kitchen_prep_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    order_code TEXT NOT NULL,
    linked_order_id INTEGER,
    stewing_date TEXT NOT NULL,
    order_type TEXT NOT NULL DEFAULT 'daily' CHECK(order_type IN ('daily', 'wedding')),
    capacity TEXT NOT NULL DEFAULT '45g',
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled', 'in_prep', 'completed')),
    qty_osmanthus INTEGER NOT NULL DEFAULT 0,
    qty_red_date INTEGER NOT NULL DEFAULT 0,
    qty_rock_sugar INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (linked_order_id) REFERENCES orders(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS idx_kitchen_prep_user ON kitchen_prep_orders(user_id);
  CREATE INDEX IF NOT EXISTS idx_kitchen_prep_date ON kitchen_prep_orders(user_id, stewing_date);
`);

const kitchenPrepCompletionCols = [
  'expected_yield INTEGER',
  'actual_yield INTEGER',
  'completion_remarks TEXT',
  'completed_at TEXT',
  'completed_by TEXT',
  'completion_splits_json TEXT',
] as const;
for (const col of kitchenPrepCompletionCols) {
  try {
    db.exec(`ALTER TABLE kitchen_prep_orders ADD COLUMN ${col}`);
  } catch {
    /* column exists */
  }
}

// Inbound Shipment Tracker (到件紀錄) — arriving supplier shipments.
db.exec(`
  CREATE TABLE IF NOT EXISTS inbound_shipments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    waybill_number TEXT,
    sender TEXT,
    arrival_date TEXT,
    photo_path TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_inbound_shipments_user ON inbound_shipments(user_id);
`);

// Enforce uniqueness of receipt numbers per user (guarded so a boot never crashes).
try {
  db.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_user_receipt_no ON expenses(user_id, receipt_no)'
  );
} catch (err) {
  console.error('Could not create unique receipt_no index:', err);
}

// Migration: add payment_method column to expenses.
if (!db.prepare('PRAGMA table_info(expenses)').all().some((c) => (c as { name: string }).name === 'payment_method')) {
  db.exec('ALTER TABLE expenses ADD COLUMN payment_method TEXT');
}

// Tables for multiple receipt images per expense and user-managed dropdown options.
db.exec(`
  CREATE TABLE IF NOT EXISTS expense_receipts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    path TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_expense_receipts_expense ON expense_receipts(expense_id);

  CREATE TABLE IF NOT EXISTS expense_options (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    value TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, type, value),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_expense_options_user ON expense_options(user_id, type);
`);

// Rental Income Management — unit leases + monthly rent records.
db.exec(`
  CREATE TABLE IF NOT EXISTS rental_units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    unit_name TEXT NOT NULL,
    tenant_name TEXT NOT NULL,
    tenant_email TEXT,
    current_year_rent REAL NOT NULL DEFAULT 0,
    previous_years_rent_json TEXT DEFAULT '[]',
    lease_start_date TEXT,
    lease_end_date TEXT,
    due_date_day INTEGER NOT NULL DEFAULT 1,
    auto_send_receipt_email INTEGER NOT NULL DEFAULT 0,
    automation_enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS rental_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    unit_id INTEGER NOT NULL,
    billing_period TEXT NOT NULL,
    actual_amount REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'paid', 'overdue')),
    invoice_ref TEXT,
    receipt_ref TEXT,
    invoice_sent_at TEXT,
    receipt_sent_at TEXT,
    paid_at TEXT,
    custom_invoice_note TEXT,
    custom_receipt_note TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, unit_id, billing_period),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (unit_id) REFERENCES rental_units(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_rental_units_user ON rental_units(user_id);
  CREATE INDEX IF NOT EXISTS idx_rental_records_user_period ON rental_records(user_id, billing_period);
  CREATE INDEX IF NOT EXISTS idx_rental_records_unit ON rental_records(unit_id);
`);

// Backfill: move any single receipt_path into the expense_receipts table once.
const legacyReceipts = db
  .prepare(
    `SELECT e.id, e.user_id, e.receipt_path
     FROM expenses e
     WHERE e.receipt_path IS NOT NULL AND e.receipt_path <> ''
       AND NOT EXISTS (SELECT 1 FROM expense_receipts r WHERE r.expense_id = e.id)`
  )
  .all() as { id: number; user_id: number; receipt_path: string }[];

if (legacyReceipts.length) {
  const insert = db.prepare(
    'INSERT INTO expense_receipts (expense_id, user_id, path) VALUES (?, ?, ?)'
  );
  const migrate = db.transaction(() => {
    for (const r of legacyReceipts) insert.run(r.id, r.user_id, r.receipt_path);
  });
  migrate();
}

export default db;
