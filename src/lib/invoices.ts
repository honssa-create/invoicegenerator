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
              c.address as customer_address, c.city as customer_city,
              c.state as customer_state, c.zip as customer_zip
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
