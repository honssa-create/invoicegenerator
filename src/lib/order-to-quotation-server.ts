import db from './db';
import { findOrCreateCustomerByFingerprint, orderToCustomerSyncInput } from './customer-server';
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
import { orderDueDate, resolveOrderAddressesForQuotation } from './orders';

async function findOrCreateCustomerFromOrder(userId: number, order: Order): Promise<number> {
  const input = orderToCustomerSyncInput(order);
  if (!input.name.trim()) input.name = 'Unknown Customer';
  return findOrCreateCustomerByFingerprint(userId, input);
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
  const shippingDate = parseOrderDate(orderDueDate(order) || '') || null;
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
      const product = (item.product_service || item.description || '').trim();
      if (!product && !item.description.trim()) continue;
      const qty = Number(item.quantity) || 0;
      const price = Number(item.unit_price) || 0;
      await insertItem.run(
        quotationId,
        product || null,
        (item.description || '').trim(),
        qty,
        price,
        qty * price
      );
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
    `created from order ${order.reference_number}${order.po_number ? ` (PO# ${order.po_number})` : ''}`
  );

  return { quotationId, quoteNumber };
}

export async function getQuotationAfterOrderConversion(userId: number, quotationId: number) {
  return getQuotationWithDetails(quotationId, userId);
}
