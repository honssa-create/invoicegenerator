import db from './db';
import { calculateQuotationTotals, type QuotationItem, type QuotationWithDetails } from './quotations';

const QUOTE_NUMBER_START = 1001001;

export function generateQuoteNumber(userId: number): string {
  const row = db
    .prepare(
      `SELECT MAX(CAST(quote_number AS INTEGER)) as max_n
       FROM quotations
       WHERE user_id = ?
         AND length(quote_number) = 7
         AND quote_number GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][0-9]'`
    )
    .get(userId) as { max_n: number | null };

  const next =
    row.max_n != null && Number.isFinite(row.max_n) && row.max_n >= QUOTE_NUMBER_START - 1
      ? row.max_n + 1
      : QUOTE_NUMBER_START;
  return String(next);
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

  const { subtotal, discountAmount, taxAmount, total } = calculateQuotationTotals(items, {
    taxRate: quotation.tax_rate as number,
    discountType: quotation.discount_type as string,
    discountValue: quotation.discount_value as number,
    shippingAmount: quotation.shipping_amount as number,
  });

  return {
    ...(quotation as unknown as QuotationWithDetails),
    discount_type: (quotation.discount_type as QuotationWithDetails['discount_type']) || 'percent',
    discount_value: Number(quotation.discount_value) || 0,
    shipping_amount: Number(quotation.shipping_amount) || 0,
    currency: (quotation.currency as string) || 'HKD',
    send_later: Boolean(Number(quotation.send_later) || 0),
    items,
    subtotal,
    discount_amount: discountAmount,
    tax_amount: taxAmount,
    total,
  };
}
