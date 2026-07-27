import db from './db';
import { getOrder } from './order-server';
import { generateQuoteNumber, getQuotationWithDetails } from './quotation-server';
import { logActivity } from './activity';
import {
  buildQuotationItemsFromOrder,
  buildQuotationNotesFromOrder,
  buildQuotationTermsFromOrder,
  quotationValidUntilFromIssueDate,
} from './order-to-quotation';
import type { Order } from './orders';

function findOrCreateCustomerFromOrder(userId: number, order: Order): number {
  const name = order.name?.trim() || 'Unknown Customer';
  const email = order.customer_email?.trim() || null;
  const phone = order.phone?.trim() || null;
  const address = order.shipping_address?.trim() || null;

  let customerId: number | undefined;

  if (email) {
    const byEmail = db
      .prepare('SELECT id FROM customers WHERE user_id = ? AND LOWER(email) = LOWER(?)')
      .get(userId, email) as { id: number } | undefined;
    customerId = byEmail?.id;
  }

  if (!customerId && name) {
    const byName = db
      .prepare('SELECT id FROM customers WHERE user_id = ? AND LOWER(name) = LOWER(?)')
      .get(userId, name) as { id: number } | undefined;
    customerId = byName?.id;
  }

  if (customerId) {
    db.prepare(
      `UPDATE customers SET
         phone = COALESCE(?, phone),
         address = COALESCE(?, address),
         email = COALESCE(?, email)
       WHERE id = ? AND user_id = ?`
    ).run(phone, address, email, customerId, userId);
    return customerId;
  }

  const result = db
    .prepare(
      `INSERT INTO customers (user_id, name, email, phone, address)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(userId, name, email, phone, address);
  return Number(result.lastInsertRowid);
}

export function convertOrderToQuotation(
  userId: number,
  orderId: number,
  authorName = 'System'
): { quotationId: number; quoteNumber: string } {
  const order = getOrder(orderId, userId);
  if (!order) throw new Error('Order not found');

  const customerId = findOrCreateCustomerFromOrder(userId, order);
  const items = buildQuotationItemsFromOrder(order);
  const today = new Date().toISOString().slice(0, 10);
  const validUntil = quotationValidUntilFromIssueDate(today, 30);
  const notes = buildQuotationNotesFromOrder(order);
  const terms = buildQuotationTermsFromOrder(order);
  const quoteNumber = generateQuoteNumber(userId);

  const create = db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO quotations (user_id, customer_id, quote_number, status, issue_date, valid_until, tax_rate, notes, terms)
         VALUES (?, ?, ?, 'draft', ?, ?, 0, ?, ?)`
      )
      .run(userId, customerId, quoteNumber, today, validUntil, notes, terms);
    const quotationId = Number(result.lastInsertRowid);

    const insertItem = db.prepare(
      'INSERT INTO quotation_items (quotation_id, description, quantity, unit_price, amount) VALUES (?, ?, ?, ?, ?)'
    );
    for (const item of items) {
      if (!item.description.trim()) continue;
      const qty = Number(item.quantity) || 0;
      const price = Number(item.unit_price) || 0;
      insertItem.run(quotationId, item.description.trim(), qty, price, qty * price);
    }

    const mergedFields = { ...order.fields, quotation_no: quoteNumber };
    db.prepare(
      `UPDATE orders SET quotation_id = ?, fields_json = ?, updated_at = datetime('now')
       WHERE id = ? AND user_id = ?`
    ).run(quotationId, JSON.stringify(mergedFields), orderId, userId);

    return quotationId;
  });

  const quotationId = create();

  logActivity(
    'order',
    orderId,
    userId,
    'activity',
    authorName,
    `converted to quotation ${quoteNumber}`
  );
  logActivity(
    'quotation',
    quotationId,
    userId,
    'activity',
    authorName,
    `created from order #${orderId}${order.po_number ? ` (${order.po_number})` : ''}`
  );

  return { quotationId, quoteNumber };
}

export function getQuotationAfterOrderConversion(userId: number, quotationId: number) {
  return getQuotationWithDetails(quotationId, userId);
}
