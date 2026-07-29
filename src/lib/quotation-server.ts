import db from './db';
import { calculateQuotationTotals, type QuotationFile, type QuotationItem, type QuotationWithDetails } from './quotations';

const QUOTE_NUMBER_START = 1001001;

/** Next 7-digit quotation number for this user (1001001, 1001002, …). */
export async function generateQuoteNumber(userId: number): Promise<string> {
  const rows = (await db
    .prepare('SELECT quote_number FROM quotations WHERE user_id = ?')
    .all(userId)) as { quote_number: string }[];

  let max = QUOTE_NUMBER_START - 1;
  for (const { quote_number } of rows) {
    if (!/^\d{7}$/.test(quote_number)) continue;
    const n = Number(quote_number);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return String(max + 1);
}

/** Quote number = source + 1 (or the next free number if that is taken). */
export async function nextQuoteNumberAfter(userId: number, current: string): Promise<string> {
  let n = /^\d{7}$/.test(current.trim())
    ? Number(current.trim()) + 1
    : Number(await generateQuoteNumber(userId));
  if (!Number.isFinite(n) || n < QUOTE_NUMBER_START) n = Number(await generateQuoteNumber(userId));

  const exists = db.prepare(
    'SELECT 1 FROM quotations WHERE user_id = ? AND quote_number = ?',
  );
  while (await exists.get(userId, String(n))) {
    n += 1;
  }
  return String(n);
}

export async function getQuotationWithDetails(
  id: number | string,
  userId: number
): Promise<QuotationWithDetails | null> {
  const quotation = (await db
    .prepare(
      `SELECT q.*, c.name as customer_name, c.email as customer_email,
              c.address as customer_address, c.city as customer_city,
              c.state as customer_state, c.zip as customer_zip
       FROM quotations q
       LEFT JOIN customers c ON c.id = q.customer_id
       WHERE q.id = ? AND q.user_id = ?`
    )
    .get(id, userId)) as Record<string, unknown> | undefined;

  if (!quotation) return null;

  const items = (await db
    .prepare('SELECT * FROM quotation_items WHERE quotation_id = ? ORDER BY id')
    .all(id)) as QuotationItem[];

  const files = (await db
    .prepare('SELECT id, path, original_name FROM quotation_files WHERE quotation_id = ? ORDER BY id')
    .all(id)) as QuotationFile[];

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
    files,
    subtotal,
    discount_amount: discountAmount,
    tax_amount: taxAmount,
    total,
  };
}
