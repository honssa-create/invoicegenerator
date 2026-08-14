import db from './db';
import { allocateGlobalRecordNumber } from './record-numbering';
import { calculateQuotationTotals, type QuotationFile, type QuotationItem, type QuotationWithDetails } from './quotations';

/** Reserve the next office-wide 8-digit quotation number. */
export async function generateQuoteNumber(_userId?: number): Promise<string> {
  return allocateGlobalRecordNumber('quotation');
}

/** Duplicates also use the next office-wide number rather than source + 1. */
export async function nextQuoteNumberAfter(_userId?: number, _current?: string): Promise<string> {
  return allocateGlobalRecordNumber('quotation');
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

  const linkedOrder = (await db
    .prepare(
      `SELECT id, reference_number, po_number FROM orders
       WHERE quotation_id = ? AND user_id = ?
       ORDER BY id ASC LIMIT 1`
    )
    .get(id, userId)) as
    | { id: number; reference_number: string | null; po_number: string | null }
    | undefined;

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
    linked_order: linkedOrder
      ? {
          id: linkedOrder.id,
          reference_number: linkedOrder.reference_number,
          po_number: linkedOrder.po_number,
        }
      : null,
  };
}
