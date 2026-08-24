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
              c.company_name as customer_company_name, c.phone as customer_phone,
              c.address as customer_address
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

/**
 * Lean list for quotation tables: one quotation query + one items query, no files.
 * Totals match getQuotationWithDetails (tax / discount / shipping).
 */
export async function listQuotations(
  userId: number,
): Promise<QuotationWithDetails[]> {
  const rows = (await db
    .prepare(
      `SELECT q.*, c.name as customer_name, c.email as customer_email,
              c.company_name as customer_company_name, c.phone as customer_phone,
              c.address as customer_address
       FROM quotations q
       LEFT JOIN customers c ON c.id = q.customer_id
       WHERE q.user_id = ?
       ORDER BY q.created_at DESC`,
    )
    .all(userId)) as Array<Record<string, unknown>>;

  if (!rows.length) return [];

  const ids = rows.map((r) => Number(r.id));
  const placeholders = ids.map(() => '?').join(',');
  const itemRows = (await db
    .prepare(
      `SELECT quotation_id, quantity, unit_price FROM quotation_items WHERE quotation_id IN (${placeholders}) ORDER BY id`,
    )
    .all(...ids)) as Array<{ quotation_id: number; quantity: number; unit_price: number }>;

  const itemsByQuote = new Map<number, { quantity: number; unit_price: number }[]>();
  for (const item of itemRows) {
    const list = itemsByQuote.get(item.quotation_id) || [];
    list.push({ quantity: Number(item.quantity) || 0, unit_price: Number(item.unit_price) || 0 });
    itemsByQuote.set(item.quotation_id, list);
  }

  const linkedRows = (await db
    .prepare(
      `SELECT DISTINCT ON (quotation_id) id, quotation_id, reference_number, po_number
       FROM orders
       WHERE user_id = ? AND quotation_id IN (${placeholders})
       ORDER BY quotation_id, id ASC`,
    )
    .all(userId, ...ids)) as Array<{
    id: number;
    quotation_id: number;
    reference_number: string | null;
    po_number: string | null;
  }>;
  const linkedByQuote = new Map(linkedRows.map((r) => [r.quotation_id, r]));

  return rows.map((quotation) => {
    const id = Number(quotation.id);
    const items = itemsByQuote.get(id) || [];
    const { subtotal, discountAmount, taxAmount, total } = calculateQuotationTotals(items, {
      taxRate: quotation.tax_rate as number,
      discountType: quotation.discount_type as string,
      discountValue: quotation.discount_value as number,
      shippingAmount: quotation.shipping_amount as number,
    });
    const linked = linkedByQuote.get(id);

    return {
      ...(quotation as unknown as QuotationWithDetails),
      discount_type: (quotation.discount_type as QuotationWithDetails['discount_type']) || 'percent',
      discount_value: Number(quotation.discount_value) || 0,
      shipping_amount: Number(quotation.shipping_amount) || 0,
      currency: (quotation.currency as string) || 'HKD',
      send_later: Boolean(Number(quotation.send_later) || 0),
      items: [],
      files: [],
      subtotal,
      discount_amount: discountAmount,
      tax_amount: taxAmount,
      total,
      linked_order: linked
        ? {
            id: linked.id,
            reference_number: linked.reference_number,
            po_number: linked.po_number,
          }
        : null,
    };
  });
}

/** Dropdown options for linking quotations to orders. */
export async function listQuotationOptions(
  userId: number,
): Promise<{ id: number; quote_number: string; status: string }[]> {
  return (await db
    .prepare('SELECT id, quote_number, status FROM quotations WHERE user_id = ? ORDER BY created_at DESC')
    .all(userId)) as { id: number; quote_number: string; status: string }[];
}
