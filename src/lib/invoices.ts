import db from './db';
import type { InvoiceItem, InvoiceWithDetails } from './types';
import { calculateInvoiceTotals } from './utils';

export { calculateInvoiceTotals, formatCurrency, formatDate, STATUS_COLORS } from './utils';

export function generateInvoiceNumber(userId: number): string {
  const year = new Date().getFullYear();
  const row = db
    .prepare(
      `SELECT COUNT(*) as count FROM invoices WHERE user_id = ? AND invoice_number LIKE ?`
    )
    .get(userId, `INV-${year}-%`) as { count: number };
  const next = row.count + 1;
  return `INV-${year}-${String(next).padStart(4, '0')}`;
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

  const { subtotal, taxAmount, total } = calculateInvoiceTotals(items, invoice.tax_rate as number);

  return {
    ...(invoice as unknown as InvoiceWithDetails),
    items,
    subtotal,
    tax_amount: taxAmount,
    total,
  };
}
