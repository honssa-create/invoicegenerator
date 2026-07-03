import db from './db';
import { calculateInvoiceTotals } from './utils';
import type { QuotationItem, QuotationWithDetails } from './quotations';

export function generateQuoteNumber(userId: number): string {
  const year = new Date().getFullYear();
  const row = db
    .prepare(`SELECT COUNT(*) as count FROM quotations WHERE user_id = ? AND quote_number LIKE ?`)
    .get(userId, `QUO-${year}-%`) as { count: number };
  return `QUO-${year}-${String(row.count + 1).padStart(4, '0')}`;
}

export function getQuotationWithDetails(id: number | string, userId: number): QuotationWithDetails | null {
  const quotation = db
    .prepare(
      `SELECT q.*, c.name as customer_name, c.email as customer_email,
              c.address as customer_address, c.city as customer_city,
              c.state as customer_state, c.zip as customer_zip
       FROM quotations q
       LEFT JOIN customers c ON c.id = q.customer_id
       WHERE q.id = ? AND q.user_id = ?`
    )
    .get(id, userId) as Record<string, unknown> | undefined;

  if (!quotation) return null;

  const items = db
    .prepare('SELECT * FROM quotation_items WHERE quotation_id = ? ORDER BY id')
    .all(id) as QuotationItem[];

  const { subtotal, taxAmount, total } = calculateInvoiceTotals(items, quotation.tax_rate as number);

  return {
    ...(quotation as unknown as QuotationWithDetails),
    items,
    subtotal,
    tax_amount: taxAmount,
    total,
  };
}
