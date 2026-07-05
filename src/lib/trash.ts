import db from './db';
import {
  TRASH_RETENTION_DAYS,
  TRASH_ENTITY_LABELS,
  type TrashEntityType,
  type TrashListItem,
} from './trash-constants';

export { TRASH_RETENTION_DAYS, TRASH_ENTITY_LABELS, type TrashEntityType, type TrashListItem } from './trash-constants';

interface DeletedRow {
  id: number;
  user_id: number;
  entity_type: TrashEntityType;
  entity_id: number;
  label: string;
  summary: string | null;
  payload: string;
  deleted_at: string;
  expires_at: string;
}

type Row = Record<string, unknown>;

function insertRow(table: string, row: Row): void {
  const keys = Object.keys(row);
  const cols = keys.map((k) => `"${k}"`).join(', ');
  const placeholders = keys.map(() => '?').join(', ');
  db.prepare(`INSERT INTO ${table} (${cols}) VALUES (${placeholders})`).run(...keys.map((k) => row[k]));
}

function rowExists(table: string, id: number, userId?: number): boolean {
  if (userId != null && table !== 'invoice_items' && table !== 'quotation_items' && table !== 'expense_receipts' && table !== 'order_files') {
    const row = db.prepare(`SELECT 1 FROM ${table} WHERE id = ? AND user_id = ?`).get(id, userId);
    return Boolean(row);
  }
  const row = db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(id);
  return Boolean(row);
}

function insertTrash(
  userId: number,
  entityType: TrashEntityType,
  entityId: number,
  label: string,
  summary: string | null,
  payload: unknown
): void {
  db.prepare(
    `INSERT INTO deleted_records (user_id, entity_type, entity_id, label, summary, payload, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now', '+' || ? || ' days'))`
  ).run(userId, entityType, entityId, label, summary, JSON.stringify(payload), TRASH_RETENTION_DAYS);
}

export function purgeExpiredTrash(): number {
  const res = db.prepare("DELETE FROM deleted_records WHERE expires_at < datetime('now')").run();
  return res.changes;
}

function daysRemaining(expiresAt: string): number {
  const row = db.prepare("SELECT CAST((julianday(?) - julianday('now')) AS INTEGER) AS d").get(expiresAt) as
    | { d: number }
    | undefined;
  return Math.max(0, row?.d ?? 0);
}

export function listTrash(userId: number): TrashListItem[] {
  purgeExpiredTrash();
  const rows = db
    .prepare(
      `SELECT id, entity_type, entity_id, label, summary, deleted_at, expires_at
       FROM deleted_records WHERE user_id = ? ORDER BY deleted_at DESC`
    )
    .all(userId) as Omit<TrashListItem, 'days_remaining' | 'can_restore'>[];

  return rows.map((r) => {
    const days = daysRemaining(r.expires_at);
    return { ...r, days_remaining: days, can_restore: days > 0 };
  });
}

function assertNotExists(table: string, id: number, userId?: number, label = 'Record'): void {
  if (rowExists(table, id, userId)) {
    throw new Error(`${label} #${id} already exists — cannot restore`);
  }
}

function restoreExpense(userId: number, payload: { expense: Row; receipts: Row[] }): number {
  const id = payload.expense.id as number;
  assertNotExists('expenses', id, userId, 'Expense');
  insertRow('expenses', payload.expense);
  for (const r of payload.receipts) insertRow('expense_receipts', r);
  return id;
}

function restoreInvoice(userId: number, payload: { invoice: Row; items: Row[] }): number {
  const id = payload.invoice.id as number;
  const customerId = payload.invoice.customer_id as number;
  assertNotExists('invoices', id, userId, 'Invoice');
  const customer = db.prepare('SELECT id FROM customers WHERE id = ? AND user_id = ?').get(customerId, userId);
  if (!customer) {
    throw new Error('Linked customer no longer exists — restore the customer first');
  }
  insertRow('invoices', payload.invoice);
  for (const item of payload.items) insertRow('invoice_items', item);
  return id;
}

function restoreCustomer(userId: number, payload: { customer: Row }): number {
  const id = payload.customer.id as number;
  assertNotExists('customers', id, userId, 'Customer');
  insertRow('customers', payload.customer);
  return id;
}

function restoreOrder(userId: number, payload: { order: Row; files: Row[] }): number {
  const id = payload.order.id as number;
  assertNotExists('orders', id, userId, 'Order');
  insertRow('orders', payload.order);
  for (const f of payload.files) insertRow('order_files', f);
  return id;
}

function restoreQuotation(userId: number, payload: { quotation: Row; items: Row[] }): number {
  const id = payload.quotation.id as number;
  assertNotExists('quotations', id, userId, 'Quotation');
  insertRow('quotations', payload.quotation);
  for (const item of payload.items) insertRow('quotation_items', item);
  return id;
}

function restoreOtherIncome(userId: number, payload: { income: Row }): number {
  const id = payload.income.id as number;
  assertNotExists('other_income', id, userId, 'Other income');
  insertRow('other_income', payload.income);
  return id;
}

function restoreInbound(userId: number, payload: { shipment: Row }): number {
  const id = payload.shipment.id as number;
  assertNotExists('inbound_shipments', id, userId, 'Inbound shipment');
  insertRow('inbound_shipments', payload.shipment);
  return id;
}

function restoreKitchenPrep(userId: number, payload: { order: Row }): number {
  const id = payload.order.id as number;
  assertNotExists('kitchen_prep_orders', id, userId, 'Kitchen prep order');
  if (payload.order.linked_order_id) {
    const linked = payload.order.linked_order_id as number;
    const parent = db.prepare('SELECT id FROM orders WHERE id = ? AND user_id = ?').get(linked, userId);
    if (!parent) {
      payload = { order: { ...payload.order, linked_order_id: null } };
    }
  }
  insertRow('kitchen_prep_orders', payload.order);
  return id;
}

function restoreOrderFile(userId: number, payload: { file: Row }): number {
  const id = payload.file.id as number;
  const orderId = payload.file.order_id as number;
  assertNotExists('order_files', id, undefined, 'Order file');
  const parent = db.prepare('SELECT id FROM orders WHERE id = ? AND user_id = ?').get(orderId, userId);
  if (!parent) {
    throw new Error('Parent order no longer exists — restore the order first');
  }
  insertRow('order_files', payload.file);
  return id;
}

export function restoreFromTrash(
  trashId: number,
  userId: number
): { entity_type: TrashEntityType; entity_id: number } {
  purgeExpiredTrash();
  const record = db
    .prepare('SELECT * FROM deleted_records WHERE id = ? AND user_id = ?')
    .get(trashId, userId) as DeletedRow | undefined;

  if (!record) throw new Error('Deleted record not found');
  if (daysRemaining(record.expires_at) <= 0) {
    throw new Error('This record has expired and can no longer be restored');
  }

  const payload = JSON.parse(record.payload) as Record<string, unknown>;
  let entityId = 0;

  const work = db.transaction(() => {
    switch (record.entity_type) {
      case 'expense':
        entityId = restoreExpense(userId, payload as { expense: Row; receipts: Row[] });
        break;
      case 'invoice':
        entityId = restoreInvoice(userId, payload as { invoice: Row; items: Row[] });
        break;
      case 'customer':
        entityId = restoreCustomer(userId, payload as { customer: Row });
        break;
      case 'order':
        entityId = restoreOrder(userId, payload as { order: Row; files: Row[] });
        break;
      case 'quotation':
        entityId = restoreQuotation(userId, payload as { quotation: Row; items: Row[] });
        break;
      case 'other_income':
        entityId = restoreOtherIncome(userId, payload as { income: Row });
        break;
      case 'inbound':
        entityId = restoreInbound(userId, payload as { shipment: Row });
        break;
      case 'kitchen_prep':
        entityId = restoreKitchenPrep(userId, payload as { order: Row });
        break;
      case 'order_file':
        entityId = restoreOrderFile(userId, payload as { file: Row });
        break;
      default:
        throw new Error('Unknown record type');
    }
    db.prepare('DELETE FROM deleted_records WHERE id = ?').run(trashId);
  });

  work();
  return { entity_type: record.entity_type, entity_id: entityId };
}

export function trashExpense(userId: number, expenseId: number): boolean {
  const expense = db.prepare('SELECT * FROM expenses WHERE id = ? AND user_id = ?').get(expenseId, userId) as Row | undefined;
  if (!expense) return false;
  const receipts = db.prepare('SELECT * FROM expense_receipts WHERE expense_id = ?').all(expenseId) as Row[];
  const label = String(expense.receipt_no || expense.merchant || `Expense #${expenseId}`);
  const summary = [expense.merchant, expense.paid_date].filter(Boolean).join(' · ') || null;

  db.transaction(() => {
    insertTrash(userId, 'expense', expenseId, label, summary, { expense, receipts });
    db.prepare('DELETE FROM expenses WHERE id = ? AND user_id = ?').run(expenseId, userId);
  })();
  return true;
}

export function trashInvoice(userId: number, invoiceId: number): boolean {
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ? AND user_id = ?').get(invoiceId, userId) as Row | undefined;
  if (!invoice) return false;
  const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(invoiceId) as Row[];
  const label = String(invoice.invoice_number || `Invoice #${invoiceId}`);
  const summary = [invoice.issue_date, invoice.status].filter(Boolean).join(' · ') || null;

  db.transaction(() => {
    insertTrash(userId, 'invoice', invoiceId, label, summary, { invoice, items });
    db.prepare('DELETE FROM invoices WHERE id = ? AND user_id = ?').run(invoiceId, userId);
  })();
  return true;
}

export function trashCustomer(userId: number, customerId: number): boolean {
  const customer = db.prepare('SELECT * FROM customers WHERE id = ? AND user_id = ?').get(customerId, userId) as Row | undefined;
  if (!customer) return false;
  const label = String(customer.name || `Customer #${customerId}`);
  const summary = [customer.email, customer.phone].filter(Boolean).join(' · ') || null;

  db.transaction(() => {
    insertTrash(userId, 'customer', customerId, label, summary, { customer });
    db.prepare('DELETE FROM customers WHERE id = ? AND user_id = ?').run(customerId, userId);
  })();
  return true;
}

export function trashOrder(userId: number, orderId: number): boolean {
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(orderId, userId) as Row | undefined;
  if (!order) return false;
  const files = db.prepare('SELECT * FROM order_files WHERE order_id = ?').all(orderId) as Row[];
  const label = String(order.po_number || order.name || `Order #${orderId}`);
  const summary = [order.name, order.status].filter(Boolean).join(' · ') || null;

  db.transaction(() => {
    insertTrash(userId, 'order', orderId, label, summary, { order, files });
    db.prepare('DELETE FROM orders WHERE id = ? AND user_id = ?').run(orderId, userId);
  })();
  return true;
}

export function trashQuotation(userId: number, quotationId: number): boolean {
  const quotation = db.prepare('SELECT * FROM quotations WHERE id = ? AND user_id = ?').get(quotationId, userId) as Row | undefined;
  if (!quotation) return false;
  const items = db.prepare('SELECT * FROM quotation_items WHERE quotation_id = ?').all(quotationId) as Row[];
  const label = String(quotation.quote_number || `Quotation #${quotationId}`);
  const summary = [quotation.issue_date, quotation.status].filter(Boolean).join(' · ') || null;

  db.transaction(() => {
    insertTrash(userId, 'quotation', quotationId, label, summary, { quotation, items });
    db.prepare('DELETE FROM quotations WHERE id = ? AND user_id = ?').run(quotationId, userId);
  })();
  return true;
}

export function trashOtherIncome(userId: number, incomeId: number): boolean {
  const income = db.prepare('SELECT * FROM other_income WHERE id = ? AND user_id = ?').get(incomeId, userId) as Row | undefined;
  if (!income) return false;
  const label = String(income.category || `Income #${incomeId}`);
  const summary = [income.txn_date, income.amount != null ? `$${income.amount}` : null].filter(Boolean).join(' · ') || null;

  db.transaction(() => {
    insertTrash(userId, 'other_income', incomeId, label, summary, { income });
    db.prepare('DELETE FROM other_income WHERE id = ? AND user_id = ?').run(incomeId, userId);
  })();
  return true;
}

export function trashInbound(userId: number, shipmentId: number): boolean {
  const shipment = db
    .prepare('SELECT * FROM inbound_shipments WHERE id = ? AND user_id = ?')
    .get(shipmentId, userId) as Row | undefined;
  if (!shipment) return false;
  const label = String(shipment.waybill_number || `Shipment #${shipmentId}`);
  const summary = [shipment.sender, shipment.arrival_date].filter(Boolean).join(' · ') || null;

  db.transaction(() => {
    insertTrash(userId, 'inbound', shipmentId, label, summary, { shipment });
    db.prepare('DELETE FROM inbound_shipments WHERE id = ? AND user_id = ?').run(shipmentId, userId);
  })();
  return true;
}

export function trashKitchenPrep(userId: number, prepId: number): boolean {
  const order = db
    .prepare('SELECT * FROM kitchen_prep_orders WHERE id = ? AND user_id = ?')
    .get(prepId, userId) as Row | undefined;
  if (!order) return false;
  const label = String(order.order_code || `Prep #${prepId}`);
  const summary = [order.stewing_date, order.order_type].filter(Boolean).join(' · ') || null;

  db.transaction(() => {
    insertTrash(userId, 'kitchen_prep', prepId, label, summary, { order });
    db.prepare('DELETE FROM kitchen_prep_orders WHERE id = ? AND user_id = ?').run(prepId, userId);
  })();
  return true;
}

export function trashOrderFile(userId: number, fileId: number): boolean {
  const file = db
    .prepare(
      `SELECT f.* FROM order_files f
       JOIN orders o ON o.id = f.order_id
       WHERE f.id = ? AND o.user_id = ?`
    )
    .get(fileId, userId) as Row | undefined;
  if (!file) return false;
  const label = String(file.original_name || `File #${fileId}`);
  const summary = `Order #${file.order_id}`;

  db.transaction(() => {
    insertTrash(userId, 'order_file', fileId, label, summary, { file });
    db.prepare(
      `DELETE FROM order_files WHERE id = ? AND order_id IN (SELECT id FROM orders WHERE user_id = ?)`
    ).run(fileId, userId);
  })();
  return true;
}
