import db from './db';
import type { Order } from './orders';
import { resolveOrderAddressesForQuotation } from './orders';

export type CustomerOrderSyncInput = {
  name: string;
  companyName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  orderType?: string | null;
};

export type CustomerFingerprint = {
  name: string;
  companyName: string;
  phone: string;
  email: string;
  address: string;
  ordered: string;
};

function normStr(v: string | null | undefined): string {
  return String(v ?? '').trim();
}

function normEmail(v: string | null | undefined): string {
  return normStr(v).toLowerCase();
}

/** Normalized contact fingerprint for dedup lookup. */
export function customerContactFingerprint(input: CustomerOrderSyncInput): CustomerFingerprint | null {
  const name = normStr(input.name);
  if (!name) return null;
  return {
    name,
    companyName: normStr(input.companyName),
    phone: normStr(input.phone),
    email: normEmail(input.email),
    address: normStr(input.address),
    ordered: normStr(input.orderType),
  };
}

export function orderToCustomerSyncInput(order: Order, nameOverride?: string): CustomerOrderSyncInput {
  const { billingAddress, shippingAddress } = resolveOrderAddressesForQuotation(order);
  return {
    name: (nameOverride ?? order.name)?.trim() || '',
    companyName: String(order.fields?.company_name ?? '').trim() || null,
    email: order.customer_email?.trim() || null,
    phone: order.phone?.trim() || null,
    address: shippingAddress || billingAddress || null,
    orderType: String(order.fields?.order_type ?? '').trim() || null,
  };
}

async function findCustomerByFingerprint(
  userId: number,
  fp: CustomerFingerprint
): Promise<number | undefined> {
  const row = (await db
    .prepare(
      `SELECT id FROM customers
       WHERE user_id = ?
         AND LOWER(trim(name)) = LOWER(?)
         AND COALESCE(trim(company_name), '') = ?
         AND COALESCE(trim(phone), '') = ?
         AND COALESCE(LOWER(trim(email)), '') = ?
         AND COALESCE(trim(address), '') = ?
         AND COALESCE(trim(ordered), '') = ?
       LIMIT 1`
    )
    .get(
      userId,
      fp.name,
      fp.companyName,
      fp.phone,
      fp.email,
      fp.address,
      fp.ordered
    )) as { id: number } | undefined;
  return row?.id;
}

/** Match on full fingerprint; insert when any field differs. Returns customer id or null. */
export async function syncCustomerFromOrder(
  userId: number,
  input: CustomerOrderSyncInput
): Promise<number | null> {
  const fp = customerContactFingerprint(input);
  if (!fp) return null;

  const existingId = await findCustomerByFingerprint(userId, fp);
  if (existingId) return existingId;

  const result = await db
    .prepare(
      `INSERT INTO customers (user_id, name, company_name, email, phone, address, ordered)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      userId,
      fp.name,
      fp.companyName || null,
      fp.email || null,
      fp.phone || null,
      fp.address || null,
      fp.ordered || null
    );
  return Number(result.lastInsertRowid);
}

export async function syncCustomerFromOrderRecord(
  userId: number,
  order: Order,
  nameOverride?: string
): Promise<number | null> {
  return syncCustomerFromOrder(userId, orderToCustomerSyncInput(order, nameOverride));
}

/** Find or create customer for quotation linking — same fingerprint rules as order sync. */
export async function findOrCreateCustomerByFingerprint(
  userId: number,
  input: CustomerOrderSyncInput
): Promise<number> {
  const id = await syncCustomerFromOrder(userId, input);
  if (id) return id;
  throw new Error('Customer name is required');
}

export async function trySyncCustomerFromOrderRecord(
  userId: number,
  order: Order,
  nameOverride?: string
): Promise<void> {
  try {
    await syncCustomerFromOrderRecord(userId, order, nameOverride);
  } catch (err) {
    console.error('[InvoiceFlow] customer sync from order failed:', err);
  }
}
