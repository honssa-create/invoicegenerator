import db from './db';
import type { InvoiceFile, InvoiceItem, InvoiceWithDetails } from './types';
import { calculateInvoiceTotals } from './utils';

export { calculateInvoiceTotals, formatCurrency, formatDate, STATUS_COLORS } from './utils';

const INVOICE_NUMBER_START = 1038;

/** Next 4-digit invoice number for this user (1038, 1039, …). */
export function generateInvoiceNumber(userId: number): string {
  const rows = db
    .prepare('SELECT invoice_number FROM invoices WHERE user_id = ?')
    .all(userId) as { invoice_number: string }[];

  let max = INVOICE_NUMBER_START - 1;
  for (const { invoice_number } of rows) {
    if (!/^\d{4,}$/.test(invoice_number)) continue;
    const n = Number(invoice_number);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return String(max + 1);
}

export function getInvoiceWithDetails(invoiceId: number, userId: number): InvoiceWithDetails | null {
  const invoice = db
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

  const items = db
    .prepare('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY id')
    .all(invoiceId) as InvoiceItem[];

  const files = db
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
    items,
    files,
    subtotal,
    discount_amount: discountAmount,
    tax_amount: taxAmount,
    total,
  };
}
