import db from './db';
import { calculateQuotationTotals, type QuotationItem, type QuotationWithDetails } from './quotations';

const QUOTE_NUMBER_START = 1001001;

/** Next 7-digit quotation number for this user (1001001, 1001002, …). */
export function generateQuoteNumber(userId: number): string {
  const rows = db
    .prepare('SELECT quote_number FROM quotations WHERE user_id = ?')
    .all(userId) as { quote_number: string }[];

  let max = QUOTE_NUMBER_START - 1;
  for (const { quote_number } of rows) {
    if (!/^\d{7}$/.test(quote_number)) continue;
    const n = Number(quote_number);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return String(max + 1);
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
