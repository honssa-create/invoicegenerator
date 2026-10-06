import db from './db';
import { mergedOptions } from './expense-options-server';
import { listInvoiceOptions } from './invoices';
import { readKitchenGiftBoxDemandData } from './kitchen-catalog-server';
import { getActivities } from './activity';
import { getOrder, ORDER_DETAIL_REL_OPTS } from './order-server';
import { parseOrderTags } from './orders';
import { listQuotationOptions } from './quotation-server';
import { readOrderTagOptionsCache, writeOrderTagOptionsCache } from './order-tag-options-cache';

async function listOrderTagOptionsUncached(ownerId: number): Promise<string[]> {
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

async function listOrderTagOptions(ownerId: number): Promise<string[]> {
  const cached = readOrderTagOptionsCache(ownerId);
  if (cached) return cached;
  const tags = await listOrderTagOptionsUncached(ownerId);
  writeOrderTagOptionsCache(ownerId, tags);
  return tags;
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
    listInvoiceOptions(ownerId),
    listQuotationOptions(ownerId),
    listAccountUsers(ownerId),
    listOrderTagOptions(ownerId),
    mergedOptions(ownerId, 'supplier'),
  ]);

  if (!order) return null;

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
    invoices,
    quotations,
    accountUsers: users,
    tagSuggestions: tags,
    supplierOptions: supplierList,
    nestieeGiftBoxes,
  };
}
