import db from './db';
import type { HubOrderRow, HubPlatform } from './hub';
import { HUB_PLATFORM_PREFIX } from './hub';

export interface HubOrderUpsertInput {
  source_platform: Exclude<HubPlatform, 'manual'>;
  original_order_id: string;
  customer_name: string;
  total_amount: number;
  status: string;
  created_at: string;
  customer_email?: string | null;
  phone?: string | null;
  shipping_address?: string | null;
  description?: string | null;
  external_po_number?: string | null;
  raw_payload?: Record<string, unknown>;
}

export interface HubInvoiceUpsertInput {
  source_platform: 'quickbooks';
  original_order_id: string;
  system_order_no: string;
  customer_name: string;
  total_amount: number;
  status: 'draft' | 'sent' | 'paid' | 'overdue';
  issue_date: string;
  due_date: string;
  customer_email?: string | null;
  invoice_number?: string | null;
  raw_payload?: Record<string, unknown>;
}

function allocateSystemOrderNo(userId: number, platform: Exclude<HubPlatform, 'manual'>): string {
  const prefix = HUB_PLATFORM_PREFIX[platform];
  const row = db
    .prepare('SELECT next_serial FROM hub_order_sequences WHERE user_id = ? AND platform = ?')
    .get(userId, platform) as { next_serial: number } | undefined;

  let serial = row?.next_serial ?? 1001;
  if (!row) {
    db.prepare('INSERT INTO hub_order_sequences (user_id, platform, next_serial) VALUES (?, ?, ?)').run(
      userId,
      platform,
      serial + 1
    );
  } else {
    db.prepare('UPDATE hub_order_sequences SET next_serial = ? WHERE user_id = ? AND platform = ?').run(
      serial + 1,
      userId,
      platform
    );
  }

  return `${prefix}-${serial}`;
}

function findOrCreateCustomer(
  userId: number,
  name: string,
  email?: string | null
): number {
  const trimmedEmail = email?.trim() || null;
  if (trimmedEmail) {
    const byEmail = db
      .prepare('SELECT id FROM customers WHERE user_id = ? AND LOWER(email) = LOWER(?)')
      .get(userId, trimmedEmail) as { id: number } | undefined;
    if (byEmail) return byEmail.id;
  }

  const byName = db
    .prepare('SELECT id FROM customers WHERE user_id = ? AND LOWER(name) = LOWER(?)')
    .get(userId, name.trim()) as { id: number } | undefined;
  if (byName) return byName.id;

  const result = db
    .prepare('INSERT INTO customers (user_id, name, email) VALUES (?, ?, ?)')
    .run(userId, name.trim() || 'Unknown Customer', trimmedEmail);
  return Number(result.lastInsertRowid);
}

/** Upsert external order — never deletes local rows. */
export function upsertHubOrder(
  userId: number,
  input: HubOrderUpsertInput
): { id: number; inserted: boolean; system_order_no: string } {
  const existing = db
    .prepare(
      `SELECT id, system_order_no FROM orders
       WHERE user_id = ? AND source_platform = ? AND original_order_id = ?`
    )
    .get(userId, input.source_platform, input.original_order_id) as
    | { id: number; system_order_no: string | null }
    | undefined;

  const fields: Record<string, unknown> = {
    order_from: input.source_platform,
    external_sync: true,
  };
  if (input.raw_payload) fields.external_payload = input.raw_payload;

  if (existing) {
    db.prepare(
      `UPDATE orders SET
         name = ?,
         status = ?,
         total_amount = ?,
         customer_email = COALESCE(?, customer_email),
         phone = COALESCE(?, phone),
         shipping_address = COALESCE(?, shipping_address),
         description = COALESCE(?, description),
         po_number = COALESCE(?, po_number),
         fields_json = ?,
         updated_at = datetime('now')
       WHERE id = ? AND user_id = ?`
    ).run(
      input.customer_name,
      input.status,
      input.total_amount,
      input.customer_email?.trim() || null,
      input.phone?.trim() || null,
      input.shipping_address?.trim() || null,
      input.description?.trim() || null,
      input.external_po_number?.trim() || null,
      JSON.stringify(fields),
      existing.id,
      userId
    );
    return {
      id: existing.id,
      inserted: false,
      system_order_no: existing.system_order_no || '',
    };
  }

  const systemOrderNo = allocateSystemOrderNo(userId, input.source_platform);
  const result = db
    .prepare(
      `INSERT INTO orders (
         user_id, source_platform, original_order_id, system_order_no,
         po_number, name, description, status, customer_email, phone,
         shipping_address, total_amount, fields_json, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    )
    .run(
      userId,
      input.source_platform,
      input.original_order_id,
      systemOrderNo,
      input.external_po_number?.trim() || systemOrderNo,
      input.customer_name,
      input.description?.trim() || null,
      input.status,
      input.customer_email?.trim() || null,
      input.phone?.trim() || null,
      input.shipping_address?.trim() || null,
      input.total_amount,
      JSON.stringify(fields),
      input.created_at
    );

  return {
    id: Number(result.lastInsertRowid),
    inserted: true,
    system_order_no: systemOrderNo,
  };
}

/** Upsert QuickBooks invoice — never deletes local rows. */
export function upsertHubInvoice(
  userId: number,
  input: HubInvoiceUpsertInput
): { id: number; inserted: boolean } {
  const existing = db
    .prepare(
      `SELECT id FROM invoices
       WHERE user_id = ? AND source_platform = ? AND original_order_id = ?`
    )
    .get(userId, input.source_platform, input.original_order_id) as { id: number } | undefined;

  const customerId = findOrCreateCustomer(userId, input.customer_name, input.customer_email);
  const invoiceNumber = input.invoice_number?.trim() || input.system_order_no;

  if (existing) {
    db.prepare(
      `UPDATE invoices SET
         customer_id = ?,
         invoice_number = ?,
         status = ?,
         issue_date = ?,
         due_date = ?,
         notes = ?,
         updated_at = datetime('now')
       WHERE id = ? AND user_id = ?`
    ).run(
      customerId,
      invoiceNumber,
      input.status,
      input.issue_date,
      input.due_date,
      `Synced from QuickBooks (ID ${input.original_order_id})`,
      existing.id,
      userId
    );
    return { id: existing.id, inserted: false };
  }

  const result = db
    .prepare(
      `INSERT INTO invoices (
         user_id, customer_id, source_platform, original_order_id, system_order_no,
         invoice_number, status, issue_date, due_date, notes, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    )
    .run(
      userId,
      customerId,
      input.source_platform,
      input.original_order_id,
      input.system_order_no,
      invoiceNumber,
      input.status,
      input.issue_date,
      input.due_date,
      `Synced from QuickBooks (ID ${input.original_order_id})`
    );

  const invoiceId = Number(result.lastInsertRowid);
  db.prepare(
    `INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, amount)
     VALUES (?, ?, 1, ?, ?)`
  ).run(invoiceId, 'QuickBooks imported total', 1, input.total_amount, input.total_amount);

  return { id: invoiceId, inserted: true };
}

export function listHubOrders(userId: number): HubOrderRow[] {
  const rows = db
    .prepare(
      `SELECT o.id, o.source_platform, o.original_order_id, o.system_order_no,
              o.name AS customer_name, o.total_amount, o.status, o.po_number,
              o.created_at, o.updated_at,
              i.id AS linked_invoice_id, i.invoice_number AS linked_invoice_number
       FROM orders o
       LEFT JOIN invoices i ON i.order_id = o.id AND i.user_id = o.user_id
       WHERE o.user_id = ?
       ORDER BY o.created_at DESC, o.id DESC`
    )
    .all(userId) as Record<string, unknown>[];

  return rows.map((r) => ({
    id: r.id as number,
    source_platform: (r.source_platform as HubPlatform) || 'manual',
    original_order_id: (r.original_order_id as string) || null,
    system_order_no: (r.system_order_no as string) || null,
    customer_name: (r.customer_name as string) || '',
    total_amount: r.total_amount as number | null,
    status: (r.status as string) || '',
    po_number: (r.po_number as string) || '',
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    linked_invoice_id: (r.linked_invoice_id as number) || null,
    linked_invoice_number: (r.linked_invoice_number as string) || null,
  }));
}

export function getSyncState(userId: number, provider: string, storeKey: string): string | null {
  const row = db
    .prepare(
      `SELECT last_synced_at FROM integration_sync_state
       WHERE user_id = ? AND provider = ? AND store_key = ?`
    )
    .get(userId, provider, storeKey) as { last_synced_at: string | null } | undefined;
  return row?.last_synced_at ?? null;
}

export function setSyncState(userId: number, provider: string, storeKey: string, syncedAt: string): void {
  db.prepare(
    `INSERT INTO integration_sync_state (user_id, provider, store_key, last_synced_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, provider, store_key)
     DO UPDATE SET last_synced_at = excluded.last_synced_at`
  ).run(userId, provider, storeKey, syncedAt);
}

export function resolveHubOwnerUserId(): number {
  const configured = Number(process.env.HUB_OWNER_USER_ID);
  if (Number.isFinite(configured) && configured > 0) return configured;

  const admin = db.prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1").get() as
    | { id: number }
    | undefined;
  if (admin) return admin.id;

  const anyUser = db.prepare('SELECT id FROM users ORDER BY id LIMIT 1').get() as { id: number } | undefined;
  if (!anyUser) throw new Error('No users in database — register an account first');
  return anyUser.id;
}
