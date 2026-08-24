import db from './db';
import type { Order } from './orders';
import { resolveOrderAddressesForQuotation } from './orders';
import { normalizeCustomerName } from './customer-name';

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

type CustomerRow = {
  id: number;
  user_id: number;
  name: string;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  ordered: string | null;
  created_at: string;
};

function normStr(v: string | null | undefined): string {
  return String(v ?? '').trim();
}

function normCustomerName(v: string | null | undefined): string {
  return normalizeCustomerName(normStr(v));
}

function normEmail(v: string | null | undefined): string {
  return normStr(v).toLowerCase();
}

export function normPhone(v: string | null | undefined): string {
  return normStr(v);
}

function toDbField(v: string | null | undefined): string | null {
  const s = normStr(v);
  return s || null;
}

/** Normalized contact fingerprint (legacy export; not used for dedup). */
export function customerContactFingerprint(input: CustomerOrderSyncInput): CustomerFingerprint | null {
  const name = normCustomerName(input.name);
  if (!name) return null;
  return {
    name,
    companyName: normStr(input.companyName),
    phone: normPhone(input.phone),
    email: normEmail(input.email),
    address: normStr(input.address),
    ordered: normStr(input.orderType),
  };
}

export function orderToCustomerSyncInput(order: Order, nameOverride?: string): CustomerOrderSyncInput {
  const { billingAddress, shippingAddress } = resolveOrderAddressesForQuotation(order);
  return {
    name: normCustomerName(nameOverride ?? order.name),
    companyName: String(order.fields?.company_name ?? '').trim() || null,
    email: order.customer_email?.trim() || null,
    phone: order.phone?.trim() || null,
    address: shippingAddress || billingAddress || null,
    orderType: String(order.fields?.order_type ?? '').trim() || null,
  };
}

function pickField(
  incoming: string | null | undefined,
  ...fallbacks: (string | null | undefined)[]
): string | null {
  const v = normStr(incoming);
  if (v) return v;
  for (const fb of fallbacks) {
    const f = normStr(fb);
    if (f) return f;
  }
  return null;
}

/** Merge incoming + fallback rows onto canonical; incoming non-empty wins. */
export function mergeCustomerFields(
  canonical: CustomerRow,
  incoming: CustomerOrderSyncInput,
  ...fallbackRows: CustomerRow[]
): {
  name: string;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  ordered: string | null;
} {
  const fb = (getter: (r: CustomerRow) => string | null | undefined) =>
    fallbackRows.map(getter);

  return {
    name: pickField(incoming.name, canonical.name, ...fb((r) => r.name)) || canonical.name,
    company_name: pickField(incoming.companyName, canonical.company_name, ...fb((r) => r.company_name)),
    email: pickField(incoming.email, canonical.email, ...fb((r) => r.email)),
    phone: pickField(incoming.phone, canonical.phone, ...fb((r) => r.phone)),
    address: pickField(incoming.address, canonical.address, ...fb((r) => r.address)),
    ordered: pickField(incoming.orderType, canonical.ordered, ...fb((r) => r.ordered)),
  };
}

/** Find customers matching name OR non-empty email OR non-empty phone. Newest first. */
export async function findCustomersByContact(
  userId: number,
  contact: { name: string; email: string; phone: string }
): Promise<CustomerRow[]> {
  const name = normCustomerName(contact.name);
  if (!name) return [];

  const email = normEmail(contact.email);
  const phone = normPhone(contact.phone);

  const orParts = ['LOWER(trim(name)) = LOWER(?)'];
  const params: unknown[] = [userId, name];

  if (email) {
    orParts.push("(COALESCE(trim(email), '') != '' AND LOWER(trim(email)) = LOWER(?))");
    params.push(email);
  }
  if (phone) {
    orParts.push("(COALESCE(trim(phone), '') != '' AND trim(phone) = ?)");
    params.push(phone);
  }

  return (await db
    .prepare(
      `SELECT * FROM customers
       WHERE user_id = ? AND (${orParts.join(' OR ')})
       ORDER BY created_at DESC NULLS LAST, id DESC`
    )
    .all(...params)) as CustomerRow[];
}

async function updateCustomerRow(
  userId: number,
  id: number,
  fields: ReturnType<typeof mergeCustomerFields>
): Promise<void> {
  await db
    .prepare(
      `UPDATE customers
       SET name = ?, company_name = ?, email = ?, phone = ?, address = ?, ordered = ?
       WHERE id = ? AND user_id = ?`
    )
    .run(
      fields.name,
      fields.company_name,
      fields.email,
      fields.phone,
      fields.address,
      fields.ordered,
      id,
      userId
    );
}

/** Repoint FKs and delete duplicate customer rows. */
export async function mergeCustomersIntoCanonical(
  userId: number,
  canonicalId: number,
  duplicateIds: number[],
  incoming: CustomerOrderSyncInput,
  fallbackRows: CustomerRow[]
): Promise<void> {
  if (!duplicateIds.length) return;

  const canonical = (await db
    .prepare('SELECT * FROM customers WHERE id = ? AND user_id = ?')
    .get(canonicalId, userId)) as CustomerRow | undefined;
  if (!canonical) throw new Error('Canonical customer not found');

  const merged = mergeCustomerFields(canonical, incoming, ...fallbackRows);

  await db.transaction(async () => {
    await updateCustomerRow(userId, canonicalId, merged);
    for (const dupId of duplicateIds) {
      await db.prepare('UPDATE invoices SET customer_id = ? WHERE customer_id = ?').run(canonicalId, dupId);
      await db.prepare('UPDATE quotations SET customer_id = ? WHERE customer_id = ?').run(canonicalId, dupId);
      await db.prepare('DELETE FROM customers WHERE id = ? AND user_id = ?').run(dupId, userId);
    }
  });
}

/** Upsert by name / email / phone contact match; merge duplicates when multiple match. */
export async function upsertCustomer(
  userId: number,
  input: CustomerOrderSyncInput
): Promise<{ id: number; created: boolean }> {
  const name = normCustomerName(input.name);
  if (!name) throw new Error('Customer name is required');

  const normalizedInput: CustomerOrderSyncInput = { ...input, name };
  const contact = { name, email: normEmail(input.email), phone: normPhone(input.phone) };
  const matches = await findCustomersByContact(userId, contact);

  if (matches.length === 0) {
    const result = await db
      .prepare(
        `INSERT INTO customers (user_id, name, company_name, email, phone, address, ordered)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        userId,
        name,
        toDbField(normalizedInput.companyName),
        toDbField(normalizedInput.email),
        toDbField(normalizedInput.phone),
        toDbField(normalizedInput.address),
        toDbField(normalizedInput.orderType)
      );
    return { id: Number(result.lastInsertRowid), created: true };
  }

  const canonical = matches[0];
  const duplicateIds = matches.slice(1).map((m) => m.id);

  if (duplicateIds.length > 0) {
    await mergeCustomersIntoCanonical(userId, canonical.id, duplicateIds, normalizedInput, matches.slice(1));
  } else {
    const merged = mergeCustomerFields(canonical, normalizedInput);
    await updateCustomerRow(userId, canonical.id, merged);
  }

  return { id: canonical.id, created: false };
}

/** Sync order contact into customers — contact dedup (name / email / phone). */
export async function syncCustomerFromOrder(
  userId: number,
  input: CustomerOrderSyncInput
): Promise<number | null> {
  const name = normCustomerName(input.name);
  if (!name) return null;
  const { id } = await upsertCustomer(userId, input);
  return id;
}

export async function syncCustomerFromOrderRecord(
  userId: number,
  order: Order,
  nameOverride?: string
): Promise<number | null> {
  return syncCustomerFromOrder(userId, orderToCustomerSyncInput(order, nameOverride));
}

/** Find or create customer for quotation linking — contact dedup rules. */
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

class UnionFind {
  private parent = new Map<number, number>();

  find(x: number): number {
    const p = this.parent.get(x);
    if (p === undefined) {
      this.parent.set(x, x);
      return x;
    }
    if (p !== x) {
      const root = this.find(p);
      this.parent.set(x, root);
      return root;
    }
    return p;
  }

  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(rb, ra);
  }

  groups(): Map<number, number[]> {
    const map = new Map<number, number[]>();
    for (const id of Array.from(this.parent.keys())) {
      const root = this.find(id);
      const list = map.get(root) ?? [];
      list.push(id);
      map.set(root, list);
    }
    return map;
  }
}

function contactKeyName(name: string): string {
  return `n:${name.toLowerCase()}`;
}

function contactKeyEmail(email: string): string {
  return `e:${email.toLowerCase()}`;
}

function contactKeyPhone(phone: string): string {
  return `p:${phone}`;
}

/** One-time dedup of existing customer rows per user (union-find on name/email/phone). */
export async function migrateCustomerDedupOnce(): Promise<void> {
  const done = await db.prepare('SELECT 1 FROM app_migrations WHERE key = ?').get('customers_contact_dedup_v1');
  if (done) return;

  const { getPool } = await import('./db');
  const conn = await getPool().connect();
  let mergedGroups = 0;
  let deletedRows = 0;

  try {
    await conn.query('BEGIN');
    await conn.query('SELECT pg_advisory_xact_lock(72910423)');

    const migCheck = await conn.query<{ key: string }>(
      `SELECT key FROM app_migrations WHERE key = 'customers_contact_dedup_v1'`
    );
    if (migCheck.rows.length) {
      await conn.query('COMMIT');
      return;
    }

    const userRows = await conn.query<{ user_id: number }>(
      `SELECT DISTINCT user_id FROM customers ORDER BY user_id`
    );

    for (const { user_id: userId } of userRows.rows) {
      const res = await conn.query<CustomerRow>(
        `SELECT id, user_id, name, company_name, email, phone, address, ordered, created_at
         FROM customers WHERE user_id = $1
         ORDER BY created_at DESC NULLS LAST, id DESC`,
        [userId]
      );
      const rows = res.rows;
      if (rows.length < 2) continue;

      const uf = new UnionFind();
      for (const row of rows) uf.find(row.id);

      const keyToId = new Map<string, number>();
      for (const row of rows) {
        const name = normStr(row.name);
        if (name) {
          const k = contactKeyName(name);
          const existing = keyToId.get(k);
          if (existing !== undefined) uf.union(row.id, existing);
          else keyToId.set(k, row.id);
        }
        const email = normEmail(row.email);
        if (email) {
          const k = contactKeyEmail(email);
          const existing = keyToId.get(k);
          if (existing !== undefined) uf.union(row.id, existing);
          else keyToId.set(k, row.id);
        }
        const phone = normPhone(row.phone);
        if (phone) {
          const k = contactKeyPhone(phone);
          const existing = keyToId.get(k);
          if (existing !== undefined) uf.union(row.id, existing);
          else keyToId.set(k, row.id);
        }
      }

      const byId = new Map(rows.map((r) => [r.id, r]));
      for (const [, ids] of Array.from(uf.groups())) {
        if (ids.length < 2) continue;

        const members = ids
          .map((id) => byId.get(id))
          .filter((r): r is CustomerRow => r !== undefined)
          .sort((a, b) => {
            const ta = a.created_at || '';
            const tb = b.created_at || '';
            if (ta !== tb) return tb.localeCompare(ta);
            return b.id - a.id;
          });

        const canonical = members[0];
        const duplicates = members.slice(1);
        const duplicateIds = duplicates.map((d) => d.id);

        const merged = mergeCustomerFields(canonical, { name: canonical.name }, ...duplicates);
        await conn.query(
          `UPDATE customers SET name = $1, company_name = $2, email = $3, phone = $4, address = $5, ordered = $6
           WHERE id = $7 AND user_id = $8`,
          [
            merged.name,
            merged.company_name,
            merged.email,
            merged.phone,
            merged.address,
            merged.ordered,
            canonical.id,
            userId,
          ]
        );

        for (const dupId of duplicateIds) {
          await conn.query(`UPDATE invoices SET customer_id = $1 WHERE customer_id = $2`, [
            canonical.id,
            dupId,
          ]);
          await conn.query(`UPDATE quotations SET customer_id = $1 WHERE customer_id = $2`, [
            canonical.id,
            dupId,
          ]);
          await conn.query(`DELETE FROM customers WHERE id = $1 AND user_id = $2`, [dupId, userId]);
        }

        mergedGroups += 1;
        deletedRows += duplicateIds.length;
      }
    }

    await conn.query(
      `INSERT INTO app_migrations (key) VALUES ('customers_contact_dedup_v1') ON CONFLICT DO NOTHING`
    );
    await conn.query('COMMIT');

    if (mergedGroups > 0) {
      console.log(
        `[InvoiceFlow] customers_contact_dedup_v1: merged ${mergedGroups} groups, deleted ${deletedRows} rows`
      );
    }
  } catch (error) {
    await conn.query('ROLLBACK');
    throw error;
  } finally {
    conn.release();
  }
}
