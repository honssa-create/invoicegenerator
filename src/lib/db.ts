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

// Backfill any expenses that predate the receipt-number feature.
const unnumbered = db
  .prepare(
    `SELECT id, user_id, created_at FROM expenses
     WHERE receipt_no IS NULL OR receipt_no = ''
     ORDER BY user_id, created_at, id`
  )
  .all() as { id: number; user_id: number; created_at: string | null }[];

if (unnumbered.length) {
  const counters = new Map<string, number>();
  const update = db.prepare('UPDATE expenses SET receipt_no = ? WHERE id = ?');
  const backfill = db.transaction(() => {
    for (const row of unnumbered) {
      const year = (row.created_at || '').slice(0, 4) || String(new Date().getFullYear());
      const key = `${row.user_id}-${year}`;
      if (!counters.has(key)) {
        const existing = db
          .prepare(
            `SELECT COUNT(*) as count FROM expenses WHERE user_id = ? AND receipt_no LIKE ?`
          )
          .get(row.user_id, `EXP-${year}-%`) as { count: number };
        counters.set(key, existing.count);
      }
      const next = counters.get(key)! + 1;
      counters.set(key, next);
      update.run(`EXP-${year}-${String(next).padStart(4, '0')}`, row.id);
    }
  });
  backfill();
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
