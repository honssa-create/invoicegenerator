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
