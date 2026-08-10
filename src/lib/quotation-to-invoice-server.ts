import db from '@/lib/db';
import { generateInvoiceNumber } from '@/lib/invoices';
import type { QuotationWithDetails } from '@/lib/quotations';

function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) {
    return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  }
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Create a draft invoice from a quotation, copying addresses, dates, ship meta,
 * discount/shipping, rich line items, and attachment file refs.
 * Caller must ensure quote.customer_id is set.
 */
export async function createInvoiceFromQuotation(
  quote: QuotationWithDetails,
  ownerId: number,
): Promise<{ invoiceId: number; invoiceNumber: string }> {
  const today = new Date().toISOString().slice(0, 10);
  const issueDate = (quote.issue_date || '').trim() || today;
  const dueDate = (quote.valid_until || '').trim() || addDaysIso(issueDate, 30);
  return await db.transaction(async () => {
    const invoiceNumber = await generateInvoiceNumber(ownerId);
    const result = await db
      .prepare(
        `INSERT INTO invoices (
           user_id, customer_id, invoice_number, status, issue_date, due_date, tax_rate, notes, terms,
           billing_address, shipping_address, email, send_later, ship_via, shipping_date, tracking_no, order_no,
           receipt_date, currency, discount_type, discount_value, shipping_amount, term
         ) VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NET30')`,
      )
      .run(
        ownerId,
        quote.customer_id,
        invoiceNumber,
        issueDate,
        dueDate,
        quote.tax_rate,
        quote.notes,
        quote.terms,
        quote.billing_address,
        quote.shipping_address,
        quote.email,
        quote.send_later ? 1 : 0,
        quote.ship_via,
        quote.shipping_date,
        quote.tracking_no,
        quote.order_no,
        quote.receipt_date,
        quote.currency || 'HKD',
        quote.discount_type === 'amount' ? 'amount' : 'percent',
        Number(quote.discount_value) || 0,
        Number(quote.shipping_amount) || 0,
      );
    const invoiceId = result.lastInsertRowid as number;

    const insertItem = db.prepare(
      `INSERT INTO invoice_items (
         invoice_id, service_date, product_service, description, quantity, unit_price, amount, class_name
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const it of quote.items) {
      await insertItem.run(
        invoiceId,
        it.service_date,
        it.product_service,
        it.description,
        it.quantity,
        it.unit_price,
        it.amount,
        it.class_name,
      );
    }

    const insertFile = db.prepare(
      'INSERT INTO invoice_files (invoice_id, user_id, path, original_name) VALUES (?, ?, ?, ?)',
    );
    for (const f of quote.files || []) {
      await insertFile.run(invoiceId, ownerId, f.path, f.original_name);
    }

    return { invoiceId, invoiceNumber };
  });
}
