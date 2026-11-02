import db from './db';
import { mergedOptions } from './expense-options-server';
import { LINKED_INVOICE_OPTION_LIMIT, listInvoiceOptions } from './invoices';
import { readKitchenGiftBoxDemandData } from './kitchen-catalog-server';
import { getActivities } from './activity';
import { getOrder, ORDER_DETAIL_REL_OPTS } from './order-server';
import { parseOrderTags } from './orders';
import { LINKED_QUOTATION_OPTION_LIMIT, listQuotationOptions } from './quotation-server';
import { readOrderTagOptionsCache, writeOrderTagOptionsCache } from './order-tag-options-cache';

const tagLoads = new Map<number, Promise<string[]>>();

/** Distinct tags in SQL. `fields.tags` is usually a JSON string inside the jsonb document. */
async function listOrderTagOptionsSql(ownerId: number): Promise<string[]> {
  const rows = (await db
    .prepare(
      `SELECT DISTINCT btrim(tag) AS tag
       FROM orders o
       CROSS JOIN LATERAL (
         SELECT CASE
           WHEN o.fields_json IS NULL OR btrim(o.fields_json) = '' THEN '[]'::jsonb
           WHEN jsonb_typeof(o.fields_json::jsonb->'tags') = 'array' THEN o.fields_json::jsonb->'tags'
           WHEN jsonb_typeof(o.fields_json::jsonb->'tags') = 'string'
                AND left(btrim(o.fields_json::jsonb->>'tags'), 1) = '['
             THEN (o.fields_json::jsonb->>'tags')::jsonb
           ELSE '[]'::jsonb
         END AS arr
       ) parsed
       CROSS JOIN LATERAL jsonb_array_elements_text(
         CASE WHEN jsonb_typeof(parsed.arr) = 'array' THEN parsed.arr ELSE '[]'::jsonb END
       ) AS tag
       WHERE o.user_id = ?
         AND o.fields_json IS NOT NULL
         AND btrim(o.fields_json) <> ''
         AND jsonb_exists(o.fields_json::jsonb, 'tags')
         AND btrim(tag) <> ''
       ORDER BY 1`,
    )
    .all(ownerId)) as Array<{ tag: string }>;
  return rows.map((row) => row.tag).filter(Boolean);
}

async function listOrderTagOptionsScan(ownerId: number): Promise<string[]> {
  const rows = (await db
    .prepare(
      `SELECT CASE
         WHEN fields_json IS NULL OR btrim(fields_json) = '' THEN NULL
         ELSE fields_json::jsonb->'tags'
       END AS tags
       FROM orders
       WHERE user_id = ?
         AND fields_json IS NOT NULL
         AND btrim(fields_json) <> ''
         AND jsonb_exists(fields_json::jsonb, 'tags')`
    )
    .all(ownerId)) as Array<{ tags: unknown }>;

  const tags = new Set<string>();
  for (const row of rows) {
    for (const t of parseOrderTags({ tags: row.tags })) tags.add(t);
  }
  return Array.from(tags).sort((a, b) => a.localeCompare(b, 'zh'));
}

async function listOrderTagOptionsUncached(ownerId: number): Promise<string[]> {
  try {
    const tags = await listOrderTagOptionsSql(ownerId);
    return tags.sort((a, b) => a.localeCompare(b, 'zh'));
  } catch {
    return listOrderTagOptionsScan(ownerId);
  }
}

async function listOrderTagOptions(ownerId: number): Promise<string[]> {
  const cached = readOrderTagOptionsCache(ownerId);
  if (cached) return cached;
  const pending = tagLoads.get(ownerId);
  if (pending) return pending;
  const job = listOrderTagOptionsUncached(ownerId)
    .then((tags) => {
      writeOrderTagOptionsCache(ownerId, tags);
      return tags;
    })
    .finally(() => {
      tagLoads.delete(ownerId);
    });
  tagLoads.set(ownerId, job);
  return job;
}

async function listAccountUsers(ownerId: number) {
  const rows = (await db
    .prepare(
      `SELECT id, name, email FROM users
       WHERE id = ? OR owner_user_id = ?
       ORDER BY name`
    )
    .all(ownerId, ownerId)) as Array<{ id: number; name: string; email: string }>;
  return rows.map((u) => ({ id: u.id, name: u.name, email: u.email }));
}

export async function loadOrderDetailBootstrap(ownerId: number, orderId: string) {
  const [
    order,
    activities,
    giftData,
    invoices,
    quotations,
    users,
    tags,
    supplierList,
  ] = await Promise.all([
    getOrder(orderId, ownerId, ORDER_DETAIL_REL_OPTS),
    getActivities('order', orderId, 40),
    readKitchenGiftBoxDemandData(ownerId),
    listInvoiceOptions(ownerId, { limit: LINKED_INVOICE_OPTION_LIMIT }),
    listQuotationOptions(ownerId, { limit: LINKED_QUOTATION_OPTION_LIMIT }),
    listAccountUsers(ownerId),
    listOrderTagOptions(ownerId),
    mergedOptions(ownerId, 'supplier'),
  ]);

  if (!order) return null;

  const invoiceOptions = [...invoices];
  if (order.linked_invoice && !invoiceOptions.some((row) => row.id === order.linked_invoice!.id)) {
    invoiceOptions.unshift({
      id: order.linked_invoice.id,
      invoice_number: order.linked_invoice.invoice_number,
      status: order.linked_invoice.status,
    });
  }
  const quotationOptions = [...quotations];
  if (order.linked_quotation && !quotationOptions.some((row) => row.id === order.linked_quotation!.id)) {
    quotationOptions.unshift({
      id: order.linked_quotation.id,
      quote_number: order.linked_quotation.quote_number,
      status: order.linked_quotation.status,
    });
  }

  const nestieeGiftBoxes = giftData.giftBoxTypes
    .filter((g) => g.active)
    .map((g) => ({
      id: g.id,
      label: g.label,
      qtyKey: g.qtyKey || `nestiee_gift_qty_${g.id}`,
    }));

  return {
    order,
    activities,
    invoices: invoiceOptions,
    quotations: quotationOptions,
    accountUsers: users,
    tagSuggestions: tags,
    supplierOptions: supplierList,
    nestieeGiftBoxes,
  };
}
