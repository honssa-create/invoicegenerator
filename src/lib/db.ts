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

  CREATE INDEX IF NOT EXISTS idx_customers_user ON customers(user_id);
  CREATE INDEX IF NOT EXISTS idx_invoices_user ON invoices(user_id);
  CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);

  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    invoice_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    payment_date TEXT NOT NULL,
    receipt_note TEXT,
    receipt_filename TEXT,
    status TEXT DEFAULT 'pending_verification' CHECK(status IN ('pending_verification', 'bank_cleared')),
    verified_at TEXT,
    verified_by INTEGER,
    locked INTEGER DEFAULT 0,
    created_by INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
    FOREIGN KEY (verified_by) REFERENCES users(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS unclaimed_deposits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    deposit_date TEXT NOT NULL,
    amount REAL NOT NULL,
    bank TEXT NOT NULL,
    remarks TEXT,
    status TEXT DEFAULT 'unclaimed' CHECK(status IN ('unclaimed', 'claimed')),
    claimed_invoice_id INTEGER,
    claimed_payment_id INTEGER,
    claimed_at TEXT,
    claimed_by INTEGER,
    created_by INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (claimed_invoice_id) REFERENCES invoices(id),
    FOREIGN KEY (claimed_payment_id) REFERENCES payments(id),
    FOREIGN KEY (claimed_by) REFERENCES users(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
  CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
  CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
  CREATE INDEX IF NOT EXISTS idx_unclaimed_user ON unclaimed_deposits(user_id);
  CREATE INDEX IF NOT EXISTS idx_unclaimed_status ON unclaimed_deposits(status);
`);

const userColumns = db.prepare('PRAGMA table_info(users)').all() as { name: string }[];
if (!userColumns.some((c) => c.name === 'role')) {
  db.exec(`ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'sales' CHECK(role IN ('sales', 'accountant'))`);
}
if (!userColumns.some((c) => c.name === 'team_id')) {
  db.exec(`ALTER TABLE users ADD COLUMN team_id INTEGER`);
  db.exec(`UPDATE users SET team_id = id WHERE team_id IS NULL`);
}

export default db;
