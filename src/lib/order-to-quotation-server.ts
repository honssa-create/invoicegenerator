import db from './db';
import { getOrder } from './order-server';
import { generateQuoteNumber, getQuotationWithDetails } from './quotation-server';
import { logActivity } from './activity';
import {
  buildQuotationItemsFromOrder,
  buildQuotationNotesFromOrder,
  buildQuotationTermsFromOrder,
  parseOrderDate,
  quotationValidUntilFromIssueDate,
} from './order-to-quotation';
import type { Order } from './orders';
import { resolveOrderAddressesForQuotation } from './orders';

async function findOrCreateCustomerFromOrder(userId: number, order: Order): Promise<number> {
  const name = order.name?.trim() || 'Unknown Customer';
  const email = order.customer_email?.trim() || null;
  const phone = order.phone?.trim() || null;
  const { billingAddress } = resolveOrderAddressesForQuotation(order);
  const address = billingAddress;

  let customerId: number | undefined;

  if (email) {
    const byEmail = await db
      .prepare('SELECT id FROM customers WHERE user_id = ? AND LOWER(email) = LOWER(?)')
      .get(userId, email) as { id: number } | undefined;
    customerId = byEmail?.id;
  }

  if (!customerId && name) {
    const byName = await db
      .prepare('SELECT id FROM customers WHERE user_id = ? AND LOWER(name) = LOWER(?)')
      .get(userId, name) as { id: number } | undefined;
    customerId = byName?.id;
  }

  if (customerId) {
    await db.prepare(
      `UPDATE customers SET
         phone = COALESCE(?, phone),
         address = COALESCE(?, address),
         email = COALESCE(?, email)
       WHERE id = ? AND user_id = ?`
    ).run(phone, address, email, customerId, userId);
    return customerId;
  }

  const result = await db
    .prepare(
      `INSERT INTO customers (user_id, name, email, phone, address)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(userId, name, email, phone, address);
  return Number(result.lastInsertRowid);
}

export async function convertOrderToQuotation(
  userId: number,
  orderId: number,
  authorName = 'System'
): Promise<{ quotationId: number; quoteNumber: string }> {
  const order = await getOrder(orderId, userId);
  if (!order) throw new Error('Order not found');

  const customerId = await findOrCreateCustomerFromOrder(userId, order);
  const items = buildQuotationItemsFromOrder(order);
  const today = new Date().toISOString().slice(0, 10);
  const validUntil = quotationValidUntilFromIssueDate(today, 30);
  const notes = buildQuotationNotesFromOrder(order);
  const terms = buildQuotationTermsFromOrder(order);
  const email = order.customer_email?.trim() || null;
  const { billingAddress, shippingAddress } = resolveOrderAddressesForQuotation(order);
  const orderNo =
    order.po_number?.trim() ||
    String(order.fields.original_order_id || '').trim() ||
    null;
  const shippingDate =
    parseOrderDate(order.delivery_date) ||
    parseOrderDate(String(order.fields.客人送貨日期 || order.fields.delivery_date || '')) ||
    null;
  const trackingNo = String(order.fields.tracking_no || '').trim() || null;

  const { quotationId, quoteNumber } = await db.transaction(async () => {
    // Allocate number inside the transaction so concurrent converts cannot collide.
    const quoteNumber = await generateQuoteNumber(userId);
    const result = await db
      .prepare(
        `INSERT INTO quotations (
           user_id, customer_id, quote_number, status, issue_date, valid_until, tax_rate, notes, terms,
           billing_address, shipping_address, email, order_no, shipping_date, tracking_no, currency
         ) VALUES (?, ?, ?, 'draft', ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, 'HKD')`
      )
      .run(
        userId,
        customerId,
        quoteNumber,
        today,
        validUntil,
        notes,
        terms,
        billingAddress,
        shippingAddress,
        email,
        orderNo,
        shippingDate,
        trackingNo
      );
    const quotationId = Number(result.lastInsertRowid);

    const insertItem = db.prepare(
      `INSERT INTO quotation_items (
         quotation_id, product_service, description, quantity, unit_price, amount
       ) VALUES (?, ?, ?, ?, ?, ?)`
    );
    for (const item of items) {
      if (!item.description.trim()) continue;
      const qty = Number(item.quantity) || 0;
      const price = Number(item.unit_price) || 0;
      const desc = item.description.trim();
      await insertItem.run(quotationId, desc, desc, qty, price, qty * price);
    }

    const mergedFields = { ...order.fields, quotation_no: quoteNumber };
    await db.prepare(
      `UPDATE orders SET quotation_id = ?, fields_json = ?, updated_at = datetime('now')
       WHERE id = ? AND user_id = ?`
    ).run(quotationId, JSON.stringify(mergedFields), orderId, userId);

    return { quotationId, quoteNumber };
  });

  await logActivity(
    'order',
    orderId,
    userId,
    'activity',
    authorName,
    `converted to quotation ${quoteNumber}`
  );
  await logActivity(
    'quotation',
    quotationId,
    userId,
    'activity',
    authorName,
    `created from order #${orderId}${order.po_number ? ` (${order.po_number})` : ''}`
  );

  return { quotationId, quoteNumber };
}

export async function getQuotationAfterOrderConversion(userId: number, quotationId: number) {
  return getQuotationWithDetails(quotationId, userId);
}
