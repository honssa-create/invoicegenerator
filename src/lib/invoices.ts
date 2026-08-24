import db from './db';
import { allocateGlobalRecordNumber } from './record-numbering';
import type { InvoiceFile, InvoiceItem, InvoiceWithDetails } from './types';
import { calculateInvoiceTotals } from './utils';

/** Reserve the next office-wide 8-digit invoice number. */
export async function generateInvoiceNumber(_userId?: number): Promise<string> {
  return allocateGlobalRecordNumber('invoice');
}

/** Duplicates also use the next office-wide number rather than source + 1. */
export async function nextInvoiceNumberAfter(_userId?: number, _current?: string): Promise<string> {
  return allocateGlobalRecordNumber('invoice');
}

/**
 * Flip `sent` invoices past their due date to `overdue`.
 * When `userId` is null, updates every user (cron / global refresh).
 */
export async function markSentInvoicesOverdue(userId: number | null = null): Promise<number> {
  const params: (number | string)[] = [];
  let userClause = '';
  if (userId !== null) {
    userClause = ' AND user_id = ?';
    params.push(userId);
  }
  const result = await db
    .prepare(
      `UPDATE invoices
       SET status = 'overdue', updated_at = datetime('now')
       WHERE status = 'sent'
         AND due_date IS NOT NULL AND trim(due_date) != ''
         AND due_date::date < CURRENT_DATE
         ${userClause}`,
    )
    .run(...params);
  return result.changes;
}

export async function getInvoiceWithDetails(invoiceId: number | string, userId: number): Promise<InvoiceWithDetails | null> {
  const invoice = await db
    .prepare(
      `SELECT i.*, c.name as customer_name, c.email as customer_email,
              c.company_name as customer_company_name, c.phone as customer_phone,
              c.address as customer_address
       FROM invoices i
       JOIN customers c ON c.id = i.customer_id
       WHERE i.id = ? AND i.user_id = ?`
    )
    .get(invoiceId, userId) as Record<string, unknown> | undefined;

  if (!invoice) return null;

  const items = await db
    .prepare('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY id')
    .all(invoiceId) as InvoiceItem[];

  const files = await db
    .prepare('SELECT id, path, original_name FROM invoice_files WHERE invoice_id = ? ORDER BY id')
    .all(invoiceId) as InvoiceFile[];

  const { subtotal, discountAmount, taxAmount, total } = calculateInvoiceTotals(items, {
    taxRate: invoice.tax_rate as number,
    discountType: invoice.discount_type as string,
    discountValue: invoice.discount_value as number,
    shippingAmount: invoice.shipping_amount as number,
  });

  return {
    ...(invoice as unknown as InvoiceWithDetails),
    discount_type: (invoice.discount_type as InvoiceWithDetails['discount_type']) || 'percent',
    discount_value: Number(invoice.discount_value) || 0,
    shipping_amount: Number(invoice.shipping_amount) || 0,
    deposit_amount:
      invoice.deposit_amount != null && invoice.deposit_amount !== ''
        ? Number(invoice.deposit_amount)
        : null,
    currency: (invoice.currency as string) || 'HKD',
    send_later: Boolean(Number(invoice.send_later) || 0),
    term: (invoice.term as string) || 'NET30',
    items,
    files,
    subtotal,
    discount_amount: discountAmount,
    tax_amount: taxAmount,
    total,
  };
}

/**
 * Lean list for invoice tables: one invoice query + one items query, no files.
 * Totals match getInvoiceWithDetails (tax / discount / shipping).
 */
export async function listInvoices(
  userId: number,
  opts: { status?: string | string[]; limit?: number } = {},
): Promise<InvoiceWithDetails[]> {
  const params: (string | number)[] = [userId];
  let statusClause = '';
  if (opts.status !== undefined) {
    const statuses = Array.isArray(opts.status) ? opts.status : [opts.status];
    if (statuses.length === 1) {
      statusClause = ' AND i.status = ?';
      params.push(statuses[0]);
    } else if (statuses.length > 1) {
      statusClause = ` AND i.status IN (${statuses.map(() => '?').join(',')})`;
      params.push(...statuses);
    }
  }

  const limitClause = opts.limit && opts.limit > 0 ? ` LIMIT ${Math.floor(opts.limit)}` : '';

  const rows = (await db
    .prepare(
      `SELECT i.*, c.name as customer_name, c.email as customer_email,
              c.company_name as customer_company_name, c.phone as customer_phone,
              c.address as customer_address
       FROM invoices i
       JOIN customers c ON c.id = i.customer_id
       WHERE i.user_id = ?${statusClause}
       ORDER BY i.created_at DESC${limitClause}`,
    )
    .all(...params)) as Array<Record<string, unknown>>;

  if (!rows.length) return [];

  const ids = rows.map((r) => Number(r.id));
  const placeholders = ids.map(() => '?').join(',');
  const itemRows = (await db
    .prepare(
      `SELECT invoice_id, quantity, unit_price FROM invoice_items WHERE invoice_id IN (${placeholders}) ORDER BY id`,
    )
    .all(...ids)) as Array<{ invoice_id: number; quantity: number; unit_price: number }>;

  const itemsByInvoice = new Map<number, { quantity: number; unit_price: number }[]>();
  for (const item of itemRows) {
    const list = itemsByInvoice.get(item.invoice_id) || [];
    list.push({ quantity: Number(item.quantity) || 0, unit_price: Number(item.unit_price) || 0 });
    itemsByInvoice.set(item.invoice_id, list);
  }

  return rows.map((invoice) => {
    const id = Number(invoice.id);
    const items = itemsByInvoice.get(id) || [];
    const { subtotal, discountAmount, taxAmount, total } = calculateInvoiceTotals(items, {
      taxRate: invoice.tax_rate as number,
      discountType: invoice.discount_type as string,
      discountValue: invoice.discount_value as number,
      shippingAmount: invoice.shipping_amount as number,
    });

    return {
      ...(invoice as unknown as InvoiceWithDetails),
      discount_type: (invoice.discount_type as InvoiceWithDetails['discount_type']) || 'percent',
      discount_value: Number(invoice.discount_value) || 0,
      shipping_amount: Number(invoice.shipping_amount) || 0,
      deposit_amount:
        invoice.deposit_amount != null && invoice.deposit_amount !== ''
          ? Number(invoice.deposit_amount)
          : null,
      currency: (invoice.currency as string) || 'HKD',
      send_later: Boolean(Number(invoice.send_later) || 0),
      term: (invoice.term as string) || 'NET30',
      items: [],
      files: [],
      subtotal,
      discount_amount: discountAmount,
      tax_amount: taxAmount,
      total,
    };
  });
}

/** Sum invoice totals for statuses without hydrating full invoice objects. */
export async function sumInvoiceTotals(
  userId: number,
  statuses: string[],
): Promise<number> {
  if (!statuses.length) return 0;
  const invoices = await listInvoices(userId, { status: statuses });
  return invoices.reduce((sum, inv) => sum + inv.total, 0);
}

/** Batch-compute invoice totals for many ids (one items query). */
export async function invoiceTotalsByIds(
  userId: number,
  invoiceIds: number[],
): Promise<Map<number, number>> {
  const ids = Array.from(
    new Set(invoiceIds.map(Number).filter((id) => Number.isFinite(id) && id > 0))
  );
  const out = new Map<number, number>();
  if (!ids.length) return out;

  const placeholders = ids.map(() => '?').join(',');
  const headers = (await db
    .prepare(
      `SELECT id, tax_rate, discount_type, discount_value, shipping_amount
       FROM invoices WHERE user_id = ? AND id IN (${placeholders})`
    )
    .all(userId, ...ids)) as Array<{
    id: number;
    tax_rate: number;
    discount_type: string;
    discount_value: number;
    shipping_amount: number;
  }>;

  if (!headers.length) return out;

  const foundIds = headers.map((h) => h.id);
  const itemPlaceholders = foundIds.map(() => '?').join(',');
  const itemRows = (await db
    .prepare(
      `SELECT invoice_id, quantity, unit_price FROM invoice_items WHERE invoice_id IN (${itemPlaceholders})`
    )
    .all(...foundIds)) as Array<{ invoice_id: number; quantity: number; unit_price: number }>;

  const itemsByInvoice = new Map<number, { quantity: number; unit_price: number }[]>();
  for (const item of itemRows) {
    const list = itemsByInvoice.get(item.invoice_id) || [];
    list.push({ quantity: Number(item.quantity) || 0, unit_price: Number(item.unit_price) || 0 });
    itemsByInvoice.set(item.invoice_id, list);
  }

  for (const invoice of headers) {
    const items = itemsByInvoice.get(invoice.id) || [];
    const { total } = calculateInvoiceTotals(items, {
      taxRate: invoice.tax_rate,
      discountType: invoice.discount_type,
      discountValue: invoice.discount_value,
      shippingAmount: invoice.shipping_amount,
    });
    out.set(invoice.id, total);
  }
  return out;
}

/** Dropdown options for linking invoices to orders. */
export async function listInvoiceOptions(
  userId: number,
): Promise<{ id: number; invoice_number: string; status: string }[]> {
  return (await db
    .prepare('SELECT id, invoice_number, status FROM invoices WHERE user_id = ? ORDER BY created_at DESC')
    .all(userId)) as { id: number; invoice_number: string; status: string }[];
}
