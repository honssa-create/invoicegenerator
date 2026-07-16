import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { warnIfEphemeralReceiptStorage } from './receipt-storage';

const defaultDbPath = path.join(process.cwd(), 'data', 'invoices.db');

let dbInstance: Database.Database | null = null;

/** During `next build`, avoid Railway runtime volume paths like /data. */
function resolveDbPath(): string {
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return path.join(process.cwd(), 'data', '.next-build.sqlite');
  }
  return process.env.DB_PATH || defaultDbPath;
}

function initializeDatabase(): Database.Database {
  if (dbInstance) return dbInstance;

  const dbPath = resolveDbPath();
  const dataDir = path.dirname(dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

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

// Migration: batch_id + receipt numbers (EXP-YYYYMM-XXX / EXP-YYYYMM-XXX-CC001).
const expenseColumns = db.prepare('PRAGMA table_info(expenses)').all() as { name: string }[];
if (!expenseColumns.some((c) => c.name === 'receipt_no')) {
  db.exec('ALTER TABLE expenses ADD COLUMN receipt_no TEXT');
}
if (!expenseColumns.some((c) => c.name === 'batch_id')) {
  db.exec('ALTER TABLE expenses ADD COLUMN batch_id TEXT');
}
if (!expenseColumns.some((c) => c.name === 'payment_method')) {
  db.exec('ALTER TABLE expenses ADD COLUMN payment_method TEXT');
}

function migratePaymentCode(method: string | null | undefined): 'CC' | 'CS' | 'BT' | 'OT' {
  const m = (method || '').toLowerCase();
  if (/credit\s*card|信用卡|credit|0860/.test(m)) return 'CC';
  if (/cash|現金|现金|hing現金/.test(m)) return 'CS';
  if (/bank|transfer|轉帳|转账|fps|payme|wire|cheque|check/.test(m)) return 'BT';
  return 'OT';
}

const BATCH_RE = /^EXP-\d{6}-\d{3}$/;
const RECEIPT_RE = /^EXP-\d{6}-\d{3}-(CC|CS|BT|OT)\d{3}$/;

const numberYm = (row: { paid_date: string | null; created_at: string | null }) => {
  const src = row.paid_date && /^\d{4}-\d{2}/.test(row.paid_date) ? row.paid_date : row.created_at || '';
  const ym = src.slice(0, 7);
  return ym ? ym.replace('-', '') : new Date().toISOString().slice(0, 7).replace('-', '');
};

type NumberRow = {
  id: number;
  user_id: number;
  receipt_no: string | null;
  batch_id: string | null;
  payment_method: string | null;
  paid_date: string | null;
  created_at: string | null;
};

const numberRows = db
  .prepare(
    'SELECT id, user_id, receipt_no, batch_id, payment_method, paid_date, created_at FROM expenses'
  )
  .all() as NumberRow[];

const updateBoth = db.prepare('UPDATE expenses SET batch_id = ?, receipt_no = ? WHERE id = ?');
const updateBatch = db.prepare('UPDATE expenses SET batch_id = ? WHERE id = ?');

// Pass 1: new receipt format → derive batch_id from receipt prefix.
for (const row of numberRows) {
  if (row.batch_id || !RECEIPT_RE.test(row.receipt_no || '')) continue;
  const batchId = row.receipt_no!.replace(/-(CC|CS|BT|OT)\d{3}$/, '');
  updateBatch.run(batchId, row.id);
  row.batch_id = batchId;
}

// Pass 2: legacy EXP-YYYYMM-XXX receipt → batch_id = old receipt, extend with payment code.
for (const row of numberRows) {
  if (RECEIPT_RE.test(row.receipt_no || '')) continue;
  if (!BATCH_RE.test(row.receipt_no || '')) continue;
  const batchId = row.receipt_no!;
  const code = migratePaymentCode(row.payment_method);
  const newReceipt = `${batchId}-${code}001`;
  updateBoth.run(batchId, newReceipt, row.id);
  row.batch_id = batchId;
  row.receipt_no = newReceipt;
}

// Pass 3: missing / invalid — assign fresh batch + receipt numbers.
const needsNumber = numberRows.filter(
  (r) => !r.batch_id || !r.receipt_no || !RECEIPT_RE.test(r.receipt_no)
);

if (needsNumber.length) {
  const batchCounters = new Map<string, number>();
  const receiptCounters = new Map<string, number>();

  for (const r of numberRows) {
    const bid =
      r.batch_id || (BATCH_RE.test(r.receipt_no || '') ? r.receipt_no : null) ||
      (RECEIPT_RE.test(r.receipt_no || '') ? r.receipt_no!.replace(/-(CC|CS|BT|OT)\d{3}$/, '') : null);
    if (bid && BATCH_RE.test(bid)) {
      const key = `${r.user_id}-${bid.slice(4, 10)}`;
      batchCounters.set(key, Math.max(batchCounters.get(key) || 0, parseInt(bid.slice(11), 10)));
    }
    const rm = RECEIPT_RE.exec(r.receipt_no || '');
    if (rm) {
      const batchId = r.receipt_no!.replace(/-(CC|CS|BT|OT)\d{3}$/, '');
      const receiptKey = `${r.user_id}-${batchId}`;
      receiptCounters.set(
        receiptKey,
        Math.max(receiptCounters.get(receiptKey) || 0, parseInt(r.receipt_no!.slice(-3), 10))
      );
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

  const backfill = db.transaction(() => {
    for (const row of needsNumber) {
      const ym = numberYm(row);
      const batchKey = `${row.user_id}-${ym}`;
      const batchNext = (batchCounters.get(batchKey) || 0) + 1;
      batchCounters.set(batchKey, batchNext);
      const batchId = `EXP-${ym}-${String(batchNext).padStart(3, '0')}`;

      const code = migratePaymentCode(row.payment_method);
      const receiptKey = `${row.user_id}-${batchId}`;
      const receiptNext = (receiptCounters.get(receiptKey) || 0) + 1;
      receiptCounters.set(receiptKey, receiptNext);
      const receiptNo = `${batchId}-${code}${String(receiptNext).padStart(3, '0')}`;

      updateBoth.run(batchId, receiptNo, row.id);
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
    tenant_phone TEXT,
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
    base_rent REAL NOT NULL DEFAULT 0,
    water_fee REAL NOT NULL DEFAULT 0,
    electricity_fee REAL NOT NULL DEFAULT 0,
    actual_amount REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'paid', 'overdue')),
    paid_date TEXT,
    invoice_ref TEXT,
    receipt_ref TEXT,
    receipt_image_path TEXT,
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

  CREATE TABLE IF NOT EXISTS rental_payment_receipts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    rent_record_id INTEGER NOT NULL,
    image_path TEXT NOT NULL,
    extracted_method TEXT,
    extracted_transfer_date TEXT,
    extracted_receiving_account TEXT,
    extracted_amount REAL,
    extraction_source TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (rent_record_id) REFERENCES rental_records(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS rental_activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    unit_id INTEGER NOT NULL,
    rent_record_id INTEGER,
    action TEXT NOT NULL,
    note TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (unit_id) REFERENCES rental_units(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_rental_units_user ON rental_units(user_id);
  CREATE INDEX IF NOT EXISTS idx_rental_records_user_period ON rental_records(user_id, billing_period);
  CREATE INDEX IF NOT EXISTS idx_rental_records_unit ON rental_records(unit_id);
  CREATE INDEX IF NOT EXISTS idx_rental_receipts_record ON rental_payment_receipts(rent_record_id);
  CREATE INDEX IF NOT EXISTS idx_rental_activities_unit ON rental_activity_logs(unit_id);
`);

// Migrate existing rental_units / rental_records columns safely.
{
  const ruCols = (db.prepare('PRAGMA table_info(rental_units)').all() as { name: string }[]).map((c) => c.name);
  if (!ruCols.includes('tenant_phone')) {
    db.exec('ALTER TABLE rental_units ADD COLUMN tenant_phone TEXT');
  }
  const rrCols = (db.prepare('PRAGMA table_info(rental_records)').all() as { name: string }[]).map((c) => c.name);
  for (const col of [
    'base_rent REAL NOT NULL DEFAULT 0',
    'water_fee REAL NOT NULL DEFAULT 0',
    'electricity_fee REAL NOT NULL DEFAULT 0',
    'paid_date TEXT',
    'receipt_image_path TEXT',
    'amount_paid REAL NOT NULL DEFAULT 0',
    'water_period_from TEXT',
    'water_period_to TEXT',
    'electricity_period_from TEXT',
    'electricity_period_to TEXT',
    'base_rent_period_from TEXT',
    'base_rent_period_to TEXT',
  ]) {
    const name = col.split(' ')[0];
    if (!rrCols.includes(name)) {
      try { db.exec(`ALTER TABLE rental_records ADD COLUMN ${col}`); } catch { /* exists */ }
    }
  }
  if (!rrCols.includes('electricity_meter_json')) {
    try { db.exec('ALTER TABLE rental_records ADD COLUMN electricity_meter_json TEXT'); } catch { /* exists */ }
  }
  if (!rrCols.includes('water_meter_json')) {
    try { db.exec('ALTER TABLE rental_records ADD COLUMN water_meter_json TEXT'); } catch { /* exists */ }
  }
}

// Rental ledger — tenants, charge line items, payments + manual allocations (parallel with rental_records).
db.exec(`
  CREATE TABLE IF NOT EXISTS rental_tenants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS rental_charge_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    unit_id INTEGER NOT NULL,
    billing_period TEXT NOT NULL,
    charge_type TEXT NOT NULL CHECK(charge_type IN ('rent', 'water', 'electricity')),
    amount_due REAL NOT NULL DEFAULT 0,
    amount_allocated REAL NOT NULL DEFAULT 0,
    legacy_record_id INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, unit_id, billing_period, charge_type),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (unit_id) REFERENCES rental_units(id) ON DELETE CASCADE,
    FOREIGN KEY (legacy_record_id) REFERENCES rental_records(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS rental_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    tenant_id INTEGER NOT NULL,
    payment_date TEXT NOT NULL,
    amount REAL NOT NULL,
    receipt_image_path TEXT,
    method TEXT,
    reference TEXT,
    notes TEXT,
    legacy_receipt_id INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id) REFERENCES rental_tenants(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS rental_payment_allocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    payment_id INTEGER NOT NULL,
    charge_item_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (payment_id) REFERENCES rental_payments(id) ON DELETE CASCADE,
    FOREIGN KEY (charge_item_id) REFERENCES rental_charge_items(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_rental_tenants_user ON rental_tenants(user_id);
  CREATE INDEX IF NOT EXISTS idx_rental_charge_items_unit_period ON rental_charge_items(unit_id, billing_period);
  CREATE INDEX IF NOT EXISTS idx_rental_charge_items_tenant_lookup ON rental_charge_items(user_id, unit_id);
  CREATE INDEX IF NOT EXISTS idx_rental_payments_tenant ON rental_payments(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_rental_allocations_payment ON rental_payment_allocations(payment_id);
  CREATE INDEX IF NOT EXISTS idx_rental_allocations_charge ON rental_payment_allocations(charge_item_id);

  CREATE TABLE IF NOT EXISTS rental_debit_note_seq (
    user_id INTEGER NOT NULL,
    note_month TEXT NOT NULL,
    last_seq INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, note_month),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS rental_debit_note_styles (
    user_id INTEGER PRIMARY KEY,
    styles_json TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS rental_leases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    unit_id INTEGER NOT NULL,
    tenant_id INTEGER,
    tenant_name TEXT NOT NULL,
    tenant_phone TEXT,
    tenant_email TEXT,
    lease_start_date TEXT NOT NULL,
    lease_end_date TEXT NOT NULL,
    actual_end_date TEXT,
    base_rent REAL NOT NULL DEFAULT 0,
    due_date_day INTEGER NOT NULL DEFAULT 1,
    deposit_amount REAL NOT NULL DEFAULT 0,
    deposit_refund REAL,
    deposit_deductions REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    end_reason TEXT,
    end_notes TEXT,
    auto_send_receipt_email INTEGER NOT NULL DEFAULT 0,
    automation_enabled INTEGER NOT NULL DEFAULT 1,
    is_current INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (unit_id) REFERENCES rental_units(id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id) REFERENCES rental_tenants(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS rental_lease_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    lease_id INTEGER NOT NULL,
    doc_type TEXT NOT NULL DEFAULT 'agreement',
    file_path TEXT NOT NULL,
    label TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (lease_id) REFERENCES rental_leases(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_rental_leases_unit ON rental_leases(unit_id);
  CREATE INDEX IF NOT EXISTS idx_rental_leases_current ON rental_leases(unit_id, is_current);
  CREATE INDEX IF NOT EXISTS idx_rental_lease_docs_lease ON rental_lease_documents(lease_id);

  CREATE TABLE IF NOT EXISTS rental_document_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    template_key TEXT NOT NULL,
    name TEXT NOT NULL,
    payment_instructions TEXT NOT NULL DEFAULT '',
    footer_remark TEXT NOT NULL DEFAULT '',
    rent_invoice_note TEXT NOT NULL DEFAULT '',
    company_json TEXT,
    updated_at TEXT DEFAULT (datetime('now')),
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, template_key),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

{
  const ruCols = (db.prepare('PRAGMA table_info(rental_units)').all() as { name: string }[]).map((c) => c.name);
  if (!ruCols.includes('tenant_id')) {
    try { db.exec('ALTER TABLE rental_units ADD COLUMN tenant_id INTEGER REFERENCES rental_tenants(id)'); } catch { /* exists */ }
  }
}

// Billing-item status (unpaid / partially_paid / paid) on rental_charge_items.
{
  const ciCols = (db.prepare('PRAGMA table_info(rental_charge_items)').all() as { name: string }[]).map((c) => c.name);
  if (!ciCols.includes('status')) {
    try {
      db.exec(`ALTER TABLE rental_charge_items ADD COLUMN status TEXT NOT NULL DEFAULT 'unpaid'`);
      db.exec(`
        UPDATE rental_charge_items SET status = CASE
          WHEN amount_due <= 0 THEN 'empty'
          WHEN amount_allocated >= amount_due - 0.009 THEN 'paid'
          WHEN amount_allocated > 0 THEN 'partially_paid'
          ELSE 'unpaid'
        END
      `);
    } catch { /* exists */ }
  }
  if (!ciCols.includes('tenant_id')) {
    try {
      db.exec(`ALTER TABLE rental_charge_items ADD COLUMN tenant_id INTEGER REFERENCES rental_tenants(id)`);
      db.exec(`
        UPDATE rental_charge_items SET tenant_id = (
          SELECT tenant_id FROM rental_units WHERE rental_units.id = rental_charge_items.unit_id
        )
      `);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_rental_charge_items_tenant ON rental_charge_items(tenant_id)`);
    } catch { /* exists */ }
  }
}

// Per-tenant utility billing: tenant pays utilities directly vs company proxy-bills on debit note.
{
  const rtCols = (db.prepare('PRAGMA table_info(rental_tenants)').all() as { name: string }[]).map((c) => c.name);
  if (!rtCols.includes('utility_billing_mode')) {
    try {
      db.exec(`ALTER TABLE rental_tenants ADD COLUMN utility_billing_mode TEXT NOT NULL DEFAULT 'company_proxy'`);
    } catch { /* exists */ }
  }
}

// Per-unit utility billing (primary setting for debit notes / notices).
{
  const ruCols = (db.prepare('PRAGMA table_info(rental_units)').all() as { name: string }[]).map((c) => c.name);
  if (!ruCols.includes('utility_billing_mode')) {
    try {
      db.exec(`ALTER TABLE rental_units ADD COLUMN utility_billing_mode TEXT NOT NULL DEFAULT 'company_proxy'`);
      db.exec(`
        UPDATE rental_units SET utility_billing_mode = COALESCE(
          (SELECT utility_billing_mode FROM rental_tenants WHERE rental_tenants.id = rental_units.tenant_id),
          'company_proxy'
        )
        WHERE tenant_id IS NOT NULL
      `);
    } catch { /* exists */ }
  }
  if (!ruCols.includes('address')) {
    try { db.exec('ALTER TABLE rental_units ADD COLUMN address TEXT'); } catch { /* exists */ }
  }
  if (!ruCols.includes('billing_company')) {
    try { db.exec('ALTER TABLE rental_units ADD COLUMN billing_company TEXT'); } catch { /* exists */ }
  }
  try {
    db.exec(`UPDATE rental_units SET utility_billing_mode = 'company_shared_meter' WHERE utility_billing_mode = 'company_proxy'`);
    db.exec(`UPDATE rental_tenants SET utility_billing_mode = 'company_shared_meter' WHERE utility_billing_mode = 'company_proxy'`);
    db.exec(`
      UPDATE rental_units SET utility_billing_mode = 'company_sub_meter'
      WHERE LOWER(TRIM(unit_name)) IN ('stock room 1', 'stock room 2')
    `);
  } catch { /* migration */ }
}

// Backfill rental_tenants from legacy tenant_name and sync charge items from rental_records.
{
  const unitsNeedingTenant = db.prepare(
    `SELECT id, user_id, tenant_name, tenant_phone, tenant_email
     FROM rental_units WHERE tenant_id IS NULL AND tenant_name IS NOT NULL AND tenant_name <> ''`
  ).all() as { id: number; user_id: number; tenant_name: string; tenant_phone: string | null; tenant_email: string | null }[];

  const findTenant = db.prepare(
    `SELECT id FROM rental_tenants WHERE user_id = ? AND name = ? COLLATE NOCASE LIMIT 1`
  );
  const insertTenant = db.prepare(
    `INSERT INTO rental_tenants (user_id, name, phone, email) VALUES (?, ?, ?, ?)`
  );
  const linkUnit = db.prepare(`UPDATE rental_units SET tenant_id = ? WHERE id = ?`);

  const backfillTenants = db.transaction(() => {
    for (const u of unitsNeedingTenant) {
      let tenantId = (findTenant.get(u.user_id, u.tenant_name) as { id: number } | undefined)?.id;
      if (!tenantId) {
        const res = insertTenant.run(u.user_id, u.tenant_name.trim(), u.tenant_phone || null, u.tenant_email || null);
        tenantId = Number(res.lastInsertRowid);
      }
      linkUnit.run(tenantId, u.id);
    }
  });
  if (unitsNeedingTenant.length) backfillTenants();

  const records = db.prepare('SELECT * FROM rental_records').all() as {
    id: number; user_id: number; unit_id: number; billing_period: string;
    base_rent: number; water_fee: number; electricity_fee: number; amount_paid: number;
  }[];

  const upsertCharge = db.prepare(
    `INSERT INTO rental_charge_items (user_id, unit_id, billing_period, charge_type, amount_due, amount_allocated, legacy_record_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, unit_id, billing_period, charge_type) DO UPDATE SET
       amount_due = excluded.amount_due,
       legacy_record_id = excluded.legacy_record_id,
       updated_at = datetime('now')`
  );
  const setAllocated = db.prepare(
    `UPDATE rental_charge_items SET amount_allocated = ?, updated_at = datetime('now') WHERE id = ?`
  );

  const syncRecords = db.transaction(() => {
    for (const rec of records) {
      const charges: [string, number][] = [
        ['rent', rec.base_rent || 0],
        ['water', rec.water_fee || 0],
        ['electricity', rec.electricity_fee || 0],
      ];
      const itemIds: { type: string; id: number; due: number }[] = [];
      for (const [type, due] of charges) {
        upsertCharge.run(rec.user_id, rec.unit_id, rec.billing_period, type, due, 0, rec.id);
        const row = db.prepare(
          `SELECT id, amount_due FROM rental_charge_items
           WHERE user_id = ? AND unit_id = ? AND billing_period = ? AND charge_type = ?`
        ).get(rec.user_id, rec.unit_id, rec.billing_period, type) as { id: number; amount_due: number };
        itemIds.push({ type, id: row.id, due: row.amount_due });
      }
      const manualAlloc = (db.prepare(
        `SELECT COALESCE(SUM(a.amount), 0) AS total
         FROM rental_payment_allocations a
         JOIN rental_charge_items c ON c.id = a.charge_item_id
         WHERE c.legacy_record_id = ?`
      ).get(rec.id) as { total: number }).total;
      if (manualAlloc > 0) {
        const byItem = db.prepare(
          `SELECT c.id, COALESCE(SUM(a.amount), 0) AS allocated
           FROM rental_charge_items c
           LEFT JOIN rental_payment_allocations a ON a.charge_item_id = c.id
           WHERE c.legacy_record_id = ?
           GROUP BY c.id`
        ).all(rec.id) as { id: number; allocated: number }[];
        for (const row of byItem) setAllocated.run(row.allocated, row.id);
      } else {
        let remaining = rec.amount_paid || 0;
        for (const item of itemIds) {
          const alloc = Math.min(remaining, item.due);
          setAllocated.run(alloc, item.id);
          remaining -= alloc;
        }
      }
    }
  });
  if (records.length) syncRecords();
}

// Backfill rental_leases from existing units (one current lease per unit).
{
  const ruCols = (db.prepare('PRAGMA table_info(rental_units)').all() as { name: string }[]).map((c) => c.name);
  if (!ruCols.includes('current_lease_id')) {
    try { db.exec('ALTER TABLE rental_units ADD COLUMN current_lease_id INTEGER REFERENCES rental_leases(id)'); } catch { /* exists */ }
  }

  const unitsNeedingLease = db.prepare(
    `SELECT u.* FROM rental_units u
     WHERE NOT EXISTS (SELECT 1 FROM rental_leases l WHERE l.unit_id = u.id AND l.is_current = 1)`
  ).all() as {
    id: number; user_id: number; tenant_name: string; tenant_phone: string | null; tenant_email: string | null;
    current_year_rent: number; lease_start_date: string | null; lease_end_date: string | null;
    due_date_day: number; auto_send_receipt_email: number; automation_enabled: number; tenant_id: number | null;
  }[];

  const insertLease = db.prepare(
    `INSERT INTO rental_leases
      (user_id, unit_id, tenant_id, tenant_name, tenant_phone, tenant_email,
       lease_start_date, lease_end_date, base_rent, due_date_day,
       auto_send_receipt_email, automation_enabled, is_current, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'active')`
  );
  const linkUnit = db.prepare(
    `UPDATE rental_units SET current_lease_id = ?, updated_at = datetime('now') WHERE id = ?`
  );

  const backfillLeases = db.transaction(() => {
    for (const u of unitsNeedingLease) {
      const name = (u.tenant_name || '').trim();
      if (!name) continue;
      const start = u.lease_start_date || new Date().toISOString().slice(0, 10);
      const end = u.lease_end_date || start;
      const res = insertLease.run(
        u.user_id, u.id, u.tenant_id ?? null, name,
        u.tenant_phone || null, u.tenant_email || null,
        start, end, u.current_year_rent || 0, u.due_date_day || 1,
        u.auto_send_receipt_email ? 1 : 0, u.automation_enabled !== 0 ? 1 : 0,
      );
      linkUnit.run(Number(res.lastInsertRowid), u.id);
    }
  });
  if (unitsNeedingLease.length) backfillLeases();
}

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

try {
  db.exec('ALTER TABLE expense_receipts ADD COLUMN source_url TEXT');
} catch {
  /* column exists */
}
db.prepare(
  `UPDATE expense_receipts SET source_url = path
   WHERE (source_url IS NULL OR source_url = '') AND path LIKE 'http%'`,
).run();

// Recycle bin — deleted records kept for 60 days before permanent purge.
db.exec(`
  CREATE TABLE IF NOT EXISTS deleted_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    label TEXT NOT NULL,
    summary TEXT,
    payload TEXT NOT NULL,
    deleted_at TEXT DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_deleted_records_user ON deleted_records(user_id);
  CREATE INDEX IF NOT EXISTS idx_deleted_records_expires ON deleted_records(expires_at);
`);

try {
  db.prepare("DELETE FROM deleted_records WHERE expires_at < datetime('now')").run();
} catch {
  /* table may not exist on first boot before exec above — ignore */
}

// User roles + per-role section permissions.
{
  const userCols = db.prepare('PRAGMA table_info(users)').all() as { name: string }[];
  if (!userCols.some((c) => c.name === 'role')) {
    db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'admin'");
    db.exec("UPDATE users SET role = 'admin' WHERE role IS NULL OR role = ''");
  }
  if (!userCols.some((c) => c.name === 'owner_user_id')) {
    db.exec('ALTER TABLE users ADD COLUMN owner_user_id INTEGER REFERENCES users(id)');
    db.exec('UPDATE users SET owner_user_id = id WHERE owner_user_id IS NULL');
  }
}

// Track who uploaded each expense (for operator-scoped visibility).
{
  const expenseCols = db.prepare('PRAGMA table_info(expenses)').all() as { name: string }[];
  if (!expenseCols.some((c) => c.name === 'created_by_user_id')) {
    db.exec('ALTER TABLE expenses ADD COLUMN created_by_user_id INTEGER REFERENCES users(id)');
    db.exec('UPDATE expenses SET created_by_user_id = user_id WHERE created_by_user_id IS NULL');
  }
  if (!expenseCols.some((c) => c.name === 'special_notes')) {
    db.exec('ALTER TABLE expenses ADD COLUMN special_notes TEXT');
  }
  if (!expenseCols.some((c) => c.name === 'supplier_input')) {
    db.exec('ALTER TABLE expenses ADD COLUMN supplier_input TEXT');
  }
  if (!expenseCols.some((c) => c.name === 'payment_channel')) {
    db.exec('ALTER TABLE expenses ADD COLUMN payment_channel TEXT');
  }
  if (!expenseCols.some((c) => c.name === 'funding_source')) {
    db.exec('ALTER TABLE expenses ADD COLUMN funding_source TEXT');
  }
  if (!expenseCols.some((c) => c.name === 'card_last4')) {
    db.exec('ALTER TABLE expenses ADD COLUMN card_last4 TEXT');
  }
}

// Global parent Batch ID sequence (EXP-0000001, never resets).
db.exec(`
  CREATE TABLE IF NOT EXISTS expense_report_sequence (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    next_serial INTEGER NOT NULL DEFAULT 1
  );
  INSERT OR IGNORE INTO expense_report_sequence (id, next_serial) VALUES (1, 1);
`);
{
  const maxReportRow = db
    .prepare(
      `SELECT batch_id FROM expenses
       WHERE batch_id GLOB 'EXP-[0-9][0-9][0-9][0-9][0-9][0-9][0-9]'
       ORDER BY batch_id DESC LIMIT 1`,
    )
    .get() as { batch_id: string } | undefined;
  if (maxReportRow?.batch_id) {
    const n = parseInt(maxReportRow.batch_id.slice(4), 10);
    if (Number.isFinite(n) && n >= 1) {
      db.prepare(
        'UPDATE expense_report_sequence SET next_serial = MAX(next_serial, ?) WHERE id = 1',
      ).run(n + 1);
    }
  }
  const legacyMaxRow = db
    .prepare(
      `SELECT batch_id FROM expenses
       WHERE batch_id GLOB 'EXP-[0-9][0-9][0-9][0-9][0-9][0-9]'
         AND batch_id NOT GLOB 'EXP-[0-9][0-9][0-9][0-9][0-9][0-9]-*'
       ORDER BY batch_id DESC LIMIT 1`,
    )
    .get() as { batch_id: string } | undefined;
  if (legacyMaxRow?.batch_id) {
    const n = parseInt(legacyMaxRow.batch_id.slice(4), 10);
    if (Number.isFinite(n) && n >= 1) {
      db.prepare(
        'UPDATE expense_report_sequence SET next_serial = MAX(next_serial, ?) WHERE id = 1',
      ).run(n + 1);
    }
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS role_permissions (
    role TEXT NOT NULL,
    section TEXT NOT NULL,
    allowed INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (role, section)
  );
`);

// Seed default operator/accountant permissions once.
{
  const permCount = (db.prepare('SELECT COUNT(*) as c FROM role_permissions').get() as { c: number }).c;
  if (permCount === 0) {
    const defaults: Record<string, Record<string, boolean>> = {
      operator: {
        dashboard: true, quotations: true, invoices: true, orders: true, inbound: true,
        kitchen: true, kitchen_prep: true, rentals: false, expenses: true, accounting: false,
        cashflow: false, scan_table: true, customers: true, trash: false, admin: false,
      },
      accountant: {
        dashboard: true, quotations: true, invoices: true, orders: false, inbound: false,
        kitchen: false, kitchen_prep: false, rentals: true, expenses: true, accounting: true,
        cashflow: true, scan_table: true, customers: true, trash: true, admin: false,
      },
    };
    const insert = db.prepare(
      'INSERT INTO role_permissions (role, section, allowed) VALUES (?, ?, ?)'
    );
    const seed = db.transaction(() => {
      for (const [role, sections] of Object.entries(defaults)) {
        for (const [section, allowed] of Object.entries(sections)) {
          insert.run(role, section, allowed ? 1 : 0);
        }
      }
    });
    seed();
  }
}

// Grant operators view access to invoices, quotations, and expenses.
{
  const upsert = db.prepare(
    `INSERT INTO role_permissions (role, section, allowed) VALUES ('operator', ?, 1)
     ON CONFLICT(role, section) DO UPDATE SET allowed = 1`
  );
  for (const section of ['invoices', 'quotations', 'expenses']) {
    upsert.run(section);
  }
}

// Per-company debit note style templates (label / elite).
{
  const styleCols = (db.prepare('PRAGMA table_info(rental_debit_note_styles)').all() as { name: string }[]).map((c) => c.name);
  if (!styleCols.includes('company_key')) {
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS rental_debit_note_styles_v2 (
          user_id INTEGER NOT NULL,
          company_key TEXT NOT NULL,
          styles_json TEXT NOT NULL,
          updated_at TEXT DEFAULT (datetime('now')),
          PRIMARY KEY (user_id, company_key),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `);
      const legacy = db.prepare('SELECT user_id, styles_json FROM rental_debit_note_styles').all() as {
        user_id: number; styles_json: string;
      }[];
      const insert = db.prepare(
        `INSERT OR IGNORE INTO rental_debit_note_styles_v2 (user_id, company_key, styles_json) VALUES (?, ?, ?)`
      );
      for (const row of legacy) {
        insert.run(row.user_id, 'label', row.styles_json);
        insert.run(row.user_id, 'elite', row.styles_json);
      }
      db.exec('DROP TABLE rental_debit_note_styles');
      db.exec('ALTER TABLE rental_debit_note_styles_v2 RENAME TO rental_debit_note_styles');
    } catch (err) {
      console.error('rental_debit_note_styles migration:', err);
    }
  }
  }

  warnIfEphemeralReceiptStorage();
  dbInstance = db;
  return dbInstance;
}

const db: Database.Database = new Proxy({} as Database.Database, {
  get(_target, prop) {
    const instance = initializeDatabase();
    const value = (instance as unknown as Record<string | symbol, unknown>)[prop];
    if (typeof value === 'function') {
      return (value as (...args: unknown[]) => unknown).bind(instance);
    }
    return value;
  },
});

export default db;
