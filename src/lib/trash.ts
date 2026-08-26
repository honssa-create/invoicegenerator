import db from './db';
import type { SessionPayload } from './auth';
import { getDataOwnerId } from './org-server';
import {
  deleteStoredFiles,
  extractStoredPathsFromTrashPayload,
} from './stored-file-cleanup';
import {
  DOCUMENT_NUMBER_RE,
  ORDER_REFERENCE_RE,
  allocateGlobalRecordNumber,
  displayInvoiceNumber,
  displayOrderNumber,
  displayQuotationNumber,
} from './record-numbering';
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

async function insertRow(table: string, row: Row): Promise<void> {
  const keys = Object.keys(row);
  const cols = keys.map((k) => `"${k}"`).join(', ');
  const placeholders = keys.map(() => '?').join(', ');
  await db.prepare(`INSERT INTO ${table} (${cols}) VALUES (${placeholders})`).run(...keys.map((k) => row[k]));
}

async function rowExists(table: string, id: number, userId?: number): Promise<boolean> {
  if (userId != null && table !== 'invoice_items' && table !== 'quotation_items' && table !== 'expense_receipts' && table !== 'order_files' && table !== 'quotation_files' && table !== 'invoice_files') {
    const row = await db.prepare(`SELECT 1 FROM ${table} WHERE id = ? AND user_id = ?`).get(id, userId);
    return Boolean(row);
  }
  const row = await db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(id);
  return Boolean(row);
}

function utcNowSql(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function addUtcDaysSql(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function parseUtcSql(value: string): Date {
  // Stored as 'YYYY-MM-DD HH:MM:SS' (UTC) or ISO strings.
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(value)) {
    return new Date(value.replace(' ', 'T') + 'Z');
  }
  return new Date(value);
}

async function insertTrash(
  userId: number,
  entityType: TrashEntityType,
  entityId: number,
  label: string,
  summary: string | null,
  payload: unknown
): Promise<void> {
  await db.prepare(
    `INSERT INTO deleted_records (user_id, entity_type, entity_id, label, summary, payload, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(userId, entityType, entityId, label, summary, JSON.stringify(payload), addUtcDaysSql(TRASH_RETENTION_DAYS));
}

export async function purgeExpiredTrash(): Promise<number> {
  const now = utcNowSql();
  const expired = (await db
    .prepare('SELECT entity_type, payload FROM deleted_records WHERE expires_at < ?')
    .all(now)) as { entity_type: TrashEntityType; payload: string }[];

  for (const row of expired) {
    try {
      const payload = JSON.parse(row.payload) as unknown;
      await deleteStoredFiles(extractStoredPathsFromTrashPayload(row.entity_type, payload));
    } catch {
      // Ignore malformed trash payloads; row will still be purged.
    }
  }

  const res = await db.prepare('DELETE FROM deleted_records WHERE expires_at < ?').run(now);
  return res.changes;
}

async function daysRemaining(expiresAt: string): Promise<number> {
  const ms = parseUtcSql(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

export async function listTrash(userId: number): Promise<TrashListItem[]> {
  await purgeExpiredTrash();
  const rows = await db
    .prepare(
      `SELECT id, entity_type, entity_id, label, summary, deleted_at, expires_at
       FROM deleted_records WHERE user_id = ? ORDER BY deleted_at DESC`
    )
    .all(userId) as Omit<TrashListItem, 'days_remaining' | 'can_restore'>[];

  return await Promise.all(rows.map(async (r) => {
    const days = await daysRemaining(r.expires_at);
    return { ...r, days_remaining: days, can_restore: days > 0 };
  }));
}

async function assertNotExists(table: string, id: number, userId?: number, label = 'Record'): Promise<void> {
  if (await rowExists(table, id, userId)) {
    throw new Error(`${label} #${id} already exists — cannot restore`);
  }
}

async function restoreExpense(userId: number, payload: { expense: Row; receipts: Row[] }): Promise<number> {
  const id = payload.expense.id as number;
  await assertNotExists('expenses', id, userId, 'Expense');
  await insertRow('expenses', payload.expense);
  for (const r of payload.receipts) await insertRow('expense_receipts', r);
  return id;
}

async function restoreInvoice(userId: number, payload: { invoice: Row; items: Row[]; files?: Row[] }): Promise<number> {
  const id = payload.invoice.id as number;
  const customerId = payload.invoice.customer_id as number;
  await assertNotExists('invoices', id, userId, 'Invoice');
  const customer = await db.prepare('SELECT id FROM customers WHERE id = ? AND user_id = ?').get(customerId, userId);
  if (!customer) {
    throw new Error('Linked customer no longer exists — restore the customer first');
  }
  const legacyNumber = String(payload.invoice.invoice_number || '');
  const numberTaken = DOCUMENT_NUMBER_RE.test(legacyNumber)
    ? await db.prepare('SELECT 1 FROM invoices WHERE invoice_number = ?').get(legacyNumber)
    : true;
  if (numberTaken) {
    if (!payload.invoice.external_invoice_number) {
      payload.invoice.external_invoice_number = legacyNumber || null;
    }
    payload.invoice.invoice_number = await allocateGlobalRecordNumber('invoice');
  }
  await insertRow('invoices', payload.invoice);
  for (const item of payload.items) await insertRow('invoice_items', item);
  for (const f of payload.files || []) await insertRow('invoice_files', f);
  return id;
}

async function restoreCustomer(userId: number, payload: { customer: Row }): Promise<number> {
  const id = payload.customer.id as number;
  await assertNotExists('customers', id, userId, 'Customer');
  await insertRow('customers', payload.customer);
  return id;
}

async function restoreOrder(userId: number, payload: { order: Row; files: Row[] }): Promise<number> {
  const id = payload.order.id as number;
  await assertNotExists('orders', id, userId, 'Order');
  const reference = String(payload.order.reference_number || '');
  const referenceTaken = ORDER_REFERENCE_RE.test(reference)
    ? await db.prepare('SELECT 1 FROM orders WHERE reference_number = ?').get(reference)
    : true;
  if (referenceTaken) {
    payload.order.reference_number = await allocateGlobalRecordNumber('order');
  }
  await insertRow('orders', payload.order);
  for (const f of payload.files) await insertRow('order_files', f);
  return id;
}

async function restoreQuotation(userId: number, payload: { quotation: Row; items: Row[]; files?: Row[] }): Promise<number> {
  const id = payload.quotation.id as number;
  await assertNotExists('quotations', id, userId, 'Quotation');
  const quoteNumber = String(payload.quotation.quote_number || '');
  const numberTaken = DOCUMENT_NUMBER_RE.test(quoteNumber)
    ? await db.prepare('SELECT 1 FROM quotations WHERE quote_number = ?').get(quoteNumber)
    : true;
  if (numberTaken) {
    payload.quotation.quote_number = await allocateGlobalRecordNumber('quotation');
  }
  await insertRow('quotations', payload.quotation);
  for (const item of payload.items) await insertRow('quotation_items', item);
  for (const f of payload.files || []) await insertRow('quotation_files', f);
  return id;
}

async function restoreOtherIncome(userId: number, payload: { income: Row }): Promise<number> {
  const id = payload.income.id as number;
  await assertNotExists('other_income', id, userId, 'Other income');
  await insertRow('other_income', payload.income);
  return id;
}

async function restoreInbound(userId: number, payload: { shipment: Row }): Promise<number> {
  const id = payload.shipment.id as number;
  await assertNotExists('inbound_shipments', id, userId, 'Inbound shipment');
  await insertRow('inbound_shipments', payload.shipment);
  return id;
}

async function restoreKitchenPrep(userId: number, payload: { order: Row }): Promise<number> {
  const id = payload.order.id as number;
  await assertNotExists('kitchen_prep_orders', id, userId, 'Kitchen prep order');
  if (payload.order.linked_order_id) {
    const linked = payload.order.linked_order_id as number;
    const parent = await db.prepare('SELECT id FROM orders WHERE id = ? AND user_id = ?').get(linked, userId);
    if (!parent) {
      payload = { order: { ...payload.order, linked_order_id: null } };
    }
  }
  await insertRow('kitchen_prep_orders', payload.order);
  return id;
}

async function restoreOrderFile(userId: number, payload: { file: Row }): Promise<number> {
  const id = payload.file.id as number;
  const orderId = payload.file.order_id as number;
  await assertNotExists('order_files', id, undefined, 'Order file');
  const parent = await db.prepare('SELECT id FROM orders WHERE id = ? AND user_id = ?').get(orderId, userId);
  if (!parent) {
    throw new Error('Parent order no longer exists — restore the order first');
  }
  await insertRow('order_files', payload.file);
  return id;
}

async function restoreQuotationFile(userId: number, payload: { file: Row }): Promise<number> {
  const id = payload.file.id as number;
  const quotationId = payload.file.quotation_id as number;
  await assertNotExists('quotation_files', id, undefined, 'Quotation file');
  const parent = await db
    .prepare('SELECT id FROM quotations WHERE id = ? AND user_id = ?')
    .get(quotationId, userId);
  if (!parent) {
    throw new Error('Parent quotation no longer exists — restore the quotation first');
  }
  await insertRow('quotation_files', payload.file);
  return id;
}

async function restoreInvoiceFile(userId: number, payload: { file: Row }): Promise<number> {
  const id = payload.file.id as number;
  const invoiceId = payload.file.invoice_id as number;
  await assertNotExists('invoice_files', id, undefined, 'Invoice file');
  const parent = await db.prepare('SELECT id FROM invoices WHERE id = ? AND user_id = ?').get(invoiceId, userId);
  if (!parent) {
    throw new Error('Parent invoice no longer exists — restore the invoice first');
  }
  await insertRow('invoice_files', payload.file);
  return id;
}

export async function restoreFromTrash(
  trashId: number,
  userId: number
): Promise<{ entity_type: TrashEntityType; entity_id: number }> {
  await purgeExpiredTrash();
  const record = await db
    .prepare('SELECT * FROM deleted_records WHERE id = ? AND user_id = ?')
    .get(trashId, userId) as DeletedRow | undefined;

  if (!record) throw new Error('Deleted record not found');
  if (await daysRemaining(record.expires_at) <= 0) {
    throw new Error('This record has expired and can no longer be restored');
  }

  const payload = JSON.parse(record.payload) as Record<string, unknown>;
  let entityId = 0;

  await db.transaction(async () => {
    switch (record.entity_type) {
      case 'expense':
        entityId = await restoreExpense(userId, payload as { expense: Row; receipts: Row[] });
        break;
      case 'invoice':
        entityId = await restoreInvoice(userId, payload as { invoice: Row; items: Row[]; files?: Row[] });
        break;
      case 'customer':
        entityId = await restoreCustomer(userId, payload as { customer: Row });
        break;
      case 'order':
        entityId = await restoreOrder(userId, payload as { order: Row; files: Row[] });
        break;
      case 'quotation':
        entityId = await restoreQuotation(userId, payload as { quotation: Row; items: Row[]; files?: Row[] });
        break;
      case 'other_income':
        entityId = await restoreOtherIncome(userId, payload as { income: Row });
        break;
      case 'inbound':
        entityId = await restoreInbound(userId, payload as { shipment: Row });
        break;
      case 'kitchen_prep':
        entityId = await restoreKitchenPrep(userId, payload as { order: Row });
        break;
      case 'order_file':
        entityId = await restoreOrderFile(userId, payload as { file: Row });
        break;
      case 'quotation_file':
        entityId = await restoreQuotationFile(userId, payload as { file: Row });
        break;
      case 'invoice_file':
        entityId = await restoreInvoiceFile(userId, payload as { file: Row });
        break;
      default:
        throw new Error('Unknown record type');
    }
    await db.prepare('DELETE FROM deleted_records WHERE id = ?').run(trashId);
  });

  return { entity_type: record.entity_type, entity_id: entityId };
}

export async function trashExpense(session: SessionPayload, expenseId: number): Promise<boolean> {
  const ownerId = await getDataOwnerId(session);
  let sql = 'SELECT * FROM expenses WHERE id = ? AND user_id = ?';
  const params: number[] = [expenseId, ownerId];
  if (session.role === 'operator') {
    sql += ' AND created_by_user_id = ?';
    params.push(session.userId);
  }
  const expense = await db.prepare(sql).get(...params) as Row | undefined;
  if (!expense) return false;
  const receipts = await db.prepare('SELECT * FROM expense_receipts WHERE expense_id = ?').all(expenseId) as Row[];
  const label = String(expense.receipt_no || expense.merchant || `Expense #${expenseId}`);
  const summary = [expense.merchant, expense.paid_date].filter(Boolean).join(' · ') || null;

  await db.transaction(async () => {
    await insertTrash(ownerId, 'expense', expenseId, label, summary, { expense, receipts });
    await db.prepare('DELETE FROM expenses WHERE id = ? AND user_id = ?').run(expenseId, ownerId);
  });
  return true;
}

export async function trashInvoice(userId: number, invoiceId: number): Promise<boolean> {
  const invoice = await db.prepare('SELECT * FROM invoices WHERE id = ? AND user_id = ?').get(invoiceId, userId) as Row | undefined;
  if (!invoice) return false;
  const items = await db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(invoiceId) as Row[];
  const files = await db.prepare('SELECT * FROM invoice_files WHERE invoice_id = ?').all(invoiceId) as Row[];
  const label = displayInvoiceNumber(String(invoice.invoice_number || '')) || `Invoice #${invoiceId}`;
  const summary = [invoice.issue_date, invoice.status].filter(Boolean).join(' · ') || null;

  await db.transaction(async () => {
    await insertTrash(userId, 'invoice', invoiceId, label, summary, { invoice, items, files });
    await db.prepare('DELETE FROM invoices WHERE id = ? AND user_id = ?').run(invoiceId, userId);
  });
  return true;
}

export async function trashCustomer(userId: number, customerId: number): Promise<boolean> {
  const customer = await db.prepare('SELECT * FROM customers WHERE id = ? AND user_id = ?').get(customerId, userId) as Row | undefined;
  if (!customer) return false;
  const label = String(customer.name || `Customer #${customerId}`);
  const summary = [customer.email, customer.phone].filter(Boolean).join(' · ') || null;

  await db.transaction(async () => {
    await insertTrash(userId, 'customer', customerId, label, summary, { customer });
    await db.prepare('DELETE FROM customers WHERE id = ? AND user_id = ?').run(customerId, userId);
  });
  return true;
}

export async function trashOrder(userId: number, orderId: number): Promise<boolean> {
  const order = await db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(orderId, userId) as Row | undefined;
  if (!order) return false;
  const files = await db.prepare('SELECT * FROM order_files WHERE order_id = ?').all(orderId) as Row[];
  const label =
    displayOrderNumber(String(order.po_number || '')) ||
    String(order.reference_number || '') ||
    `Order #${orderId}`;
  const summary = [order.po_number, order.name, order.status].filter(Boolean).join(' · ') || null;

  await db.transaction(async () => {
    await insertTrash(userId, 'order', orderId, label, summary, { order, files });
    await db.prepare('DELETE FROM orders WHERE id = ? AND user_id = ?').run(orderId, userId);
  });
  return true;
}

export async function trashQuotation(userId: number, quotationId: number): Promise<boolean> {
  const quotation = await db.prepare('SELECT * FROM quotations WHERE id = ? AND user_id = ?').get(quotationId, userId) as Row | undefined;
  if (!quotation) return false;
  const items = await db.prepare('SELECT * FROM quotation_items WHERE quotation_id = ?').all(quotationId) as Row[];
  const files = await db.prepare('SELECT * FROM quotation_files WHERE quotation_id = ?').all(quotationId) as Row[];
  const label = displayQuotationNumber(String(quotation.quote_number || '')) || `Quotation #${quotationId}`;
  const summary = [quotation.issue_date, quotation.status].filter(Boolean).join(' · ') || null;

  await db.transaction(async () => {
    await insertTrash(userId, 'quotation', quotationId, label, summary, { quotation, items, files });
    await db.prepare('DELETE FROM quotations WHERE id = ? AND user_id = ?').run(quotationId, userId);
  });
  return true;
}

export async function trashOtherIncome(userId: number, incomeId: number): Promise<boolean> {
  const income = await db.prepare('SELECT * FROM other_income WHERE id = ? AND user_id = ?').get(incomeId, userId) as Row | undefined;
  if (!income) return false;
  const label = String(income.category || `Income #${incomeId}`);
  const summary = [income.txn_date, income.amount != null ? `$${income.amount}` : null].filter(Boolean).join(' · ') || null;

  await db.transaction(async () => {
    await insertTrash(userId, 'other_income', incomeId, label, summary, { income });
    await db.prepare('DELETE FROM other_income WHERE id = ? AND user_id = ?').run(incomeId, userId);
  });
  return true;
}

export async function trashInbound(userId: number, shipmentId: number): Promise<boolean> {
  const shipment = await db
    .prepare('SELECT * FROM inbound_shipments WHERE id = ? AND user_id = ?')
    .get(shipmentId, userId) as Row | undefined;
  if (!shipment) return false;
  const label = String(shipment.waybill_number || `Shipment #${shipmentId}`);
  const summary = [shipment.sender, shipment.arrival_date].filter(Boolean).join(' · ') || null;

  await db.transaction(async () => {
    await insertTrash(userId, 'inbound', shipmentId, label, summary, { shipment });
    await db.prepare('DELETE FROM inbound_shipments WHERE id = ? AND user_id = ?').run(shipmentId, userId);
  });
  return true;
}

export async function trashKitchenPrep(userId: number, prepId: number): Promise<boolean> {
  const order = await db
    .prepare('SELECT * FROM kitchen_prep_orders WHERE id = ? AND user_id = ?')
    .get(prepId, userId) as Row | undefined;
  if (!order) return false;
  const label = String(order.order_code || `Prep #${prepId}`);
  const summary = [order.stewing_date, order.order_type].filter(Boolean).join(' · ') || null;

  await db.transaction(async () => {
    await insertTrash(userId, 'kitchen_prep', prepId, label, summary, { order });
    await db.prepare('DELETE FROM kitchen_prep_orders WHERE id = ? AND user_id = ?').run(prepId, userId);
  });
  return true;
}

export async function trashOrderFile(userId: number, fileId: number): Promise<boolean> {
  const file = await db
    .prepare(
      `SELECT f.* FROM order_files f
       JOIN orders o ON o.id = f.order_id
       WHERE f.id = ? AND o.user_id = ?`
    )
    .get(fileId, userId) as Row | undefined;
  if (!file) return false;
  const label = String(file.original_name || `File #${fileId}`);
  const summary = `Order #${file.order_id}`;

  await db.transaction(async () => {
    await insertTrash(userId, 'order_file', fileId, label, summary, { file });
    await db.prepare(
      `DELETE FROM order_files WHERE id = ? AND order_id IN (SELECT id FROM orders WHERE user_id = ?)`
    ).run(fileId, userId);
  });
  return true;
}

export async function trashQuotationFile(userId: number, fileId: number): Promise<boolean> {
  const file = await db
    .prepare(
      `SELECT f.* FROM quotation_files f
       JOIN quotations q ON q.id = f.quotation_id
       WHERE f.id = ? AND q.user_id = ?`,
    )
    .get(fileId, userId) as Row | undefined;
  if (!file) return false;
  const label = String(file.original_name || `File #${fileId}`);
  const summary = `Quotation #${file.quotation_id}`;

  await db.transaction(async () => {
    await insertTrash(userId, 'quotation_file', fileId, label, summary, { file });
    await db.prepare(
      `DELETE FROM quotation_files WHERE id = ? AND quotation_id IN (SELECT id FROM quotations WHERE user_id = ?)`,
    ).run(fileId, userId);
  });
  return true;
}

export async function trashInvoiceFile(userId: number, fileId: number): Promise<boolean> {
  const file = await db
    .prepare(
      `SELECT f.* FROM invoice_files f
       JOIN invoices i ON i.id = f.invoice_id
       WHERE f.id = ? AND i.user_id = ?`,
    )
    .get(fileId, userId) as Row | undefined;
  if (!file) return false;
  const label = String(file.original_name || `File #${fileId}`);
  const summary = `Invoice #${file.invoice_id}`;

  await db.transaction(async () => {
    await insertTrash(userId, 'invoice_file', fileId, label, summary, { file });
    await db.prepare(
      `DELETE FROM invoice_files WHERE id = ? AND invoice_id IN (SELECT id FROM invoices WHERE user_id = ?)`,
    ).run(fileId, userId);
  });
  return true;
}
