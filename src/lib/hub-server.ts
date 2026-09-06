import db from './db';
import type { HubOrderRow, HubPlatform } from './hub';
import { HUB_PLATFORM_PREFIX } from './hub';
import { pickBestHubOrderMatch, type HubOrderMatchCandidate } from './hub-link';
import { normalizeCustomerName } from './customer-name';
import { allocateGlobalRecordNumber } from './record-numbering';
import {
  formatWooAddress,
  parseNestieeLinesFromWoo,
  parseNestieePaymentFromWoo,
  parsePaymentAmount,
  parseWooShippingTotal,
  parseWooShippingMethod,
  normalizeOrderShippingMethod,
  appendNestieeShippingLine,
  applyNestieeGiftBoxAutoQtys,
  buildHonourLinesFromWoo,
  mergeHonourLinesPreservingLocal,
  parseHonourLines,
  honourLinesDerivedFields,
  honourProductLineCount,
  parseHonourSuppliers,
  honourSuppliersDerivedFields,
  parseHonourCpoNotesFromLines,
  parseHonourPaymentFromWoo,
  resolveHonourReceiptDateOnIngest,
  resolveNestieeReceiptDateOnIngest,
  pruneStaleOrderFields,
  orderTypeFromFields,
  WEDDING_GIFT_ORDER_TYPE,
  WOO_PLATFORM_ORDER_TYPE,
  parseCupmokaLinesFromWoo,
  appendCupmokaShippingLine,
  parseCupmokaPaymentFromWoo,
  parseCupmokaShipmentTracking,
  type WooAddressLike,
  type WooLineItemLike,
} from './orders';
import { getOrder } from './order-server';
import { trySyncCustomerFromOrderRecord } from './customer-server';
import { getWooStoreConfigs } from './woocommerce';

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
  billing_address?: string | null;
  description?: string | null;
  notes?: string | null;
  external_po_number?: string | null;
  company_name?: string | null;
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
  order_id?: number | null;
  raw_payload?: Record<string, unknown>;
}

async function allocateSystemOrderNo(userId: number, platform: Exclude<HubPlatform, 'manual'>): Promise<string> {
  const prefix = HUB_PLATFORM_PREFIX[platform];
  const row = await db
    .prepare('SELECT next_serial FROM hub_order_sequences WHERE user_id = ? AND platform = ?')
    .get(userId, platform) as { next_serial: number } | undefined;

  let serial = row?.next_serial ?? 1001;
  if (!row) {
    await db.prepare('INSERT INTO hub_order_sequences (user_id, platform, next_serial) VALUES (?, ?, ?)').run(
      userId,
      platform,
      serial + 1
    );
  } else {
    await db.prepare('UPDATE hub_order_sequences SET next_serial = ? WHERE user_id = ? AND platform = ?').run(
      serial + 1,
      userId,
      platform
    );
  }

  return `${prefix}-${serial}`;
}

async function findOrCreateCustomer(
  userId: number,
  name: string,
  email?: string | null
): Promise<number> {
  const { upsertCustomer } = await import('./customer-server');
  const { id } = await upsertCustomer(userId, {
    name: name.trim() || 'Unknown Customer',
    email: email?.trim() || null,
  });
  return id;
}

async function syncCustomerAfterHubOrder(userId: number, orderId: number): Promise<void> {
  const order = await getOrder(orderId, userId);
  if (order) await trySyncCustomerFromOrderRecord(userId, order);
}

/** Upsert external order — never deletes local rows. */
export async function upsertHubOrder(
  userId: number,
  input: HubOrderUpsertInput
): Promise<{ id: number; inserted: boolean; system_order_no: string }> {
  input = {
    ...input,
    customer_name: normalizeCustomerName(input.customer_name) || input.customer_name.trim(),
  };
  const existing = await db
    .prepare(
      `SELECT id, system_order_no, fields_json, notes, shipping_address FROM orders
       WHERE user_id = ? AND source_platform = ? AND original_order_id = ?`
    )
    .get(userId, input.source_platform, input.original_order_id) as
    | {
        id: number;
        system_order_no: string | null;
        fields_json: string | null;
        notes: string | null;
        shipping_address: string | null;
      }
    | undefined;

  let fields: Record<string, unknown> = {};
  if (existing?.fields_json) {
    try {
      fields = JSON.parse(existing.fields_json) || {};
    } catch {
      fields = {};
    }
  }
  fields.order_from = input.source_platform;
  pruneStaleOrderFields(fields);
  const mappedType = WOO_PLATFORM_ORDER_TYPE[input.source_platform as keyof typeof WOO_PLATFORM_ORDER_TYPE];
  if (mappedType) fields.order_type = mappedType;

  let shippingAddress = input.shipping_address?.trim() || null;
  let importedNotes = input.notes?.trim() || '';

  if (input.source_platform === 'nestiee' && input.raw_payload) {
    const payload = input.raw_payload;
    const rawLines = (payload.line_items as WooLineItemLike[] | undefined) || [];
    const shippingTotal = parseWooShippingTotal(payload);
    const nestieeLines = appendNestieeShippingLine(
      parseNestieeLinesFromWoo(rawLines),
      shippingTotal
    );
    fields.nestiee_lines = JSON.stringify(nestieeLines);
    applyNestieeGiftBoxAutoQtys(fields, nestieeLines);

    const shipMethod = parseWooShippingMethod(payload);
    if (shipMethod && !String(fields.shipping_method || '').trim()) {
      fields.shipping_method = normalizeOrderShippingMethod(shipMethod);
    }

    // Nestiee delivery_date meta / EPO 送貨安排 → linked receipt-date fields.
    // Woo wins on re-sync (admin/customer date changes after checkout).
    const receiptDate = resolveNestieeReceiptDateOnIngest(
      fields,
      nestieeLines,
      typeof payload.date_created === 'string' ? payload.date_created : '',
      payload
    );
    if (receiptDate) {
      fields.due_date = receiptDate;
      fields.client_delivery_date = receiptDate;
    }

    const verified = fields.payment_verified === true || fields.payment_verified === 'true';
    const existingPay =
      parsePaymentAmount(fields.payment_amount) || parsePaymentAmount(fields.payment1_amount);
    if (!verified && existingPay <= 0 && input.total_amount > 0) {
      const amount = String(Math.round(input.total_amount * 100) / 100);
      fields.payment_amount = amount;
      fields.payment1_amount = amount;
    }

    if (!verified) {
      const pay = parseNestieePaymentFromWoo(payload);
      const hasMethod = String(fields.payment_method_detail || '').trim();
      if (!hasMethod && pay.method) {
        fields.payment_method_detail = pay.method;
        if (pay.note) fields.payment_method_note = pay.note;
      }
      if (!String(fields.payment_bank || '').trim() && pay.bank) {
        fields.payment_bank = pay.bank;
      }
    }
  }

  if (
    (input.source_platform === 'honour' || input.source_platform === 'honour_en') &&
    input.raw_payload
  ) {
    const payload = input.raw_payload;
    const rawLines = (payload.line_items as WooLineItemLike[] | undefined) || [];
    const shippingTotal = parseWooShippingTotal(payload);
    const incoming = buildHonourLinesFromWoo(rawLines, shippingTotal);
    const existingLines = parseHonourLines(fields as Record<string, string | boolean>);
    const honourLines = mergeHonourLinesPreservingLocal(incoming, existingLines);
    Object.assign(fields, honourLinesDerivedFields(honourLines));

    // Pad supplier cards to product count (grow-only); seed from legacy flats if needed.
    const suppliers = parseHonourSuppliers(fields as Record<string, string | boolean>, {
      minCount: honourProductLineCount(honourLines),
    });
    Object.assign(fields, honourSuppliersDerivedFields(suppliers));

    const cpoNotes = parseHonourCpoNotesFromLines(rawLines);
    if (cpoNotes && !importedNotes.includes(cpoNotes)) {
      importedNotes = [importedNotes, cpoNotes].filter(Boolean).join('\n');
    }

    const shipMethod = parseWooShippingMethod(payload);
    if (shipMethod && !String(fields.shipping_method || '').trim()) {
      fields.shipping_method = normalizeOrderShippingMethod(shipMethod);
    }

    // The status-bar and Shipment Detail inputs are the same receipt date.
    // Woo estimate wins on re-sync; keep a local date only if Woo has none.
    const receiptDate = resolveHonourReceiptDateOnIngest(fields, payload);
    if (receiptDate) {
      fields.due_date = receiptDate;
      fields.client_delivery_date = receiptDate;
    }

    const verified = fields.payment_verified === true || fields.payment_verified === 'true';
    const existingPay =
      parsePaymentAmount(fields.payment_amount) || parsePaymentAmount(fields.payment1_amount);
    if (!verified && existingPay <= 0 && input.total_amount > 0) {
      const amount = String(Math.round(input.total_amount * 100) / 100);
      fields.payment_amount = amount;
      fields.payment1_amount = amount;
    }

    if (!verified) {
      const pay = parseHonourPaymentFromWoo(payload);
      const hasMethod = String(fields.payment_method_detail || '').trim();
      if (!hasMethod && pay.method) {
        fields.payment_method_detail = pay.method;
        if (pay.note) fields.payment_method_note = pay.note;
      }
      if (!String(fields.payment_bank || '').trim() && pay.bank) {
        fields.payment_bank = pay.bank;
      }
      if (!String(fields.payment_option || '').trim() && pay.bank) {
        fields.payment_option = pay.bank;
      }
    }
  }

  if (input.source_platform === 'cupmoka' && input.raw_payload) {
    const payload = input.raw_payload;
    const rawLines = (payload.line_items as WooLineItemLike[] | undefined) || [];
    const shippingTotal = parseWooShippingTotal(payload);
    const cupmokaLines = appendCupmokaShippingLine(
      parseCupmokaLinesFromWoo(rawLines),
      shippingTotal
    );
    fields.cupmoka_lines = JSON.stringify(cupmokaLines);

    const shipMethod = parseWooShippingMethod(payload);
    if (shipMethod && !String(fields.shipping_method || '').trim()) {
      fields.shipping_method = normalizeOrderShippingMethod(shipMethod);
    }

    const tracking = parseCupmokaShipmentTracking(payload);
    if (tracking.tracking_no && !String(fields.tracking_no || '').trim()) {
      fields.tracking_no = tracking.tracking_no;
    }
    if (tracking.shipping_method_hint && !String(fields.shipping_method || '').trim()) {
      fields.shipping_method = normalizeOrderShippingMethod(tracking.shipping_method_hint);
    }

    const verified = fields.payment_verified === true || fields.payment_verified === 'true';
    const existingPay =
      parsePaymentAmount(fields.payment_amount) || parsePaymentAmount(fields.payment1_amount);
    if (!verified && existingPay <= 0 && input.total_amount > 0) {
      const amount = String(Math.round(input.total_amount * 100) / 100);
      fields.payment_amount = amount;
      fields.payment1_amount = amount;
    }

    if (!verified) {
      const pay = parseCupmokaPaymentFromWoo(payload);
      const hasMethod = String(fields.payment_method_detail || '').trim();
      if (!hasMethod && pay.method) {
        fields.payment_method_detail = pay.method;
        if (pay.note) fields.payment_method_note = pay.note;
      }
      if (!String(fields.payment_bank || '').trim() && pay.bank) {
        fields.payment_bank = pay.bank;
      }
      const hasPayDate =
        String(fields.payment_date || '').trim() || String(fields.payment1_date || '').trim();
      if (!hasPayDate && pay.datePaid) {
        fields.payment_date = pay.datePaid;
        fields.payment1_date = pay.datePaid;
      }
    }
  }

  if (input.source_platform === 'clickup' && input.raw_payload) {
    const payload = input.raw_payload as { _mapped_fields?: Record<string, string> };
    fields.order_type = WEDDING_GIFT_ORDER_TYPE;
    fields.order_from = 'clickup';
    const mapped = payload._mapped_fields;
    const verified = fields.payment_verified === true || fields.payment_verified === 'true';
    const paymentKeys = new Set([
      'payment_amount',
      'payment1_amount',
      'payment2_amount',
      'payment_date',
      'payment1_date',
      'payment2_date',
      'payment_bank',
      'payment_method_detail',
      'payment_status_label',
      'payment_method_note',
    ]);
    if (mapped) {
      for (const [k, v] of Object.entries(mapped)) {
        if (v === undefined || v === null || String(v).trim() === '') continue;
        if (verified && paymentKeys.has(k)) continue;
        fields[k] = String(v);
      }
    }
  }

  // Capture Woo billing address for all store platforms (honour / nestiee / cupmoka).
  const billingFromInput = input.billing_address?.trim() || '';
  const billingFromPayload = input.raw_payload
    ? formatWooAddress(input.raw_payload.billing as WooAddressLike | undefined)
    : '';
  const billingAddress = billingFromInput || billingFromPayload;
  if (billingAddress) fields.billing_address = billingAddress;
  if (!shippingAddress && billingAddress) shippingAddress = billingAddress;

  const companyName = input.company_name?.trim();
  if (companyName) fields.company_name = companyName;

  const notesToWrite =
    importedNotes && !(existing?.notes || '').trim() ? importedNotes : null;
  const orderType = orderTypeFromFields(fields);

  if (existing) {
    await db.prepare(
      `UPDATE orders SET
         name = ?,
         status = ?,
         total_amount = ?,
         customer_email = COALESCE(?, customer_email),
         phone = COALESCE(?, phone),
         shipping_address = COALESCE(?, shipping_address),
         description = COALESCE(?, description),
         notes = COALESCE(?, notes),
         po_number = COALESCE(?, po_number),
         fields_json = ?,
         order_type = ?,
         updated_at = datetime('now')
       WHERE id = ? AND user_id = ?`
    ).run(
      input.customer_name,
      input.status,
      input.total_amount,
      input.customer_email?.trim() || null,
      input.phone?.trim() || null,
      shippingAddress,
      input.description?.trim() || null,
      notesToWrite,
      input.external_po_number?.trim() || null,
      JSON.stringify(fields),
      orderType,
      existing.id,
      userId
    );
    await syncCustomerAfterHubOrder(userId, existing.id);
    return {
      id: existing.id,
      inserted: false,
      system_order_no: existing.system_order_no || '',
    };
  }

  const systemOrderNo = await allocateSystemOrderNo(userId, input.source_platform);
  const result = await db.transaction(async () => {
    const referenceNumber = await allocateGlobalRecordNumber('order');
    return db
      .prepare(
        `INSERT INTO orders (
           user_id, source_platform, original_order_id, system_order_no, reference_number,
           po_number, name, description, status, customer_email, phone,
           shipping_address, total_amount, notes, fields_json, order_type, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      )
      .run(
        userId,
        input.source_platform,
        input.original_order_id,
        systemOrderNo,
        referenceNumber,
        input.external_po_number?.trim() || null,
        input.customer_name,
        input.description?.trim() || null,
        input.status,
        input.customer_email?.trim() || null,
        input.phone?.trim() || null,
        shippingAddress,
        input.total_amount,
        importedNotes || null,
        JSON.stringify(fields),
        orderType,
        input.created_at
      );
  });

  const orderId = Number(result.lastInsertRowid);
  await syncCustomerAfterHubOrder(userId, orderId);

  return {
    id: orderId,
    inserted: true,
    system_order_no: systemOrderNo,
  };
}

/** Find an existing hub order to attach a QuickBooks invoice to. */
export async function findOrderForQuickBooksInvoice(
  userId: number,
  input: {
    docNumber?: string | null;
    customerName?: string | null;
    totalAmount?: number | null;
    txnDate?: string | null;
  }
): Promise<number | null> {
  const rows = await db
    .prepare(
      `SELECT id, po_number, system_order_no, name AS customer_name, total_amount, created_at
       FROM orders
       WHERE user_id = ? AND source_platform != 'quickbooks'
       ORDER BY created_at DESC`
    )
    .all(userId) as HubOrderMatchCandidate[];

  const match = pickBestHubOrderMatch(rows, input);
  return match?.id ?? null;
}

/** Upsert QuickBooks invoice — never deletes local rows. */
export async function upsertHubInvoice(
  userId: number,
  input: HubInvoiceUpsertInput
): Promise<{ id: number; inserted: boolean; order_id: number | null }> {
  const existing = await db
    .prepare(
      `SELECT id FROM invoices
       WHERE user_id = ? AND source_platform = ? AND original_order_id = ?`
    )
    .get(userId, input.source_platform, input.original_order_id) as { id: number } | undefined;

  const customerId = await findOrCreateCustomer(userId, input.customer_name, input.customer_email);
  const externalInvoiceNumber = input.invoice_number?.trim() || input.system_order_no;
  const orderId = input.order_id ?? null;

  if (existing) {
    await db.prepare(
      `UPDATE invoices SET
         customer_id = ?,
         external_invoice_number = ?,
         status = ?,
         issue_date = ?,
         due_date = ?,
         notes = ?,
         order_id = COALESCE(?, order_id),
         updated_at = datetime('now')
       WHERE id = ? AND user_id = ?`
    ).run(
      customerId,
      externalInvoiceNumber,
      input.status,
      input.issue_date,
      input.due_date,
      `Synced from QuickBooks (ID ${input.original_order_id})`,
      orderId,
      existing.id,
      userId
    );
    const linked = await db
      .prepare('SELECT order_id FROM invoices WHERE id = ? AND user_id = ?')
      .get(existing.id, userId) as { order_id: number | null } | undefined;
    return { id: existing.id, inserted: false, order_id: linked?.order_id ?? orderId };
  }

  const invoiceId = await db.transaction(async () => {
    const invoiceNumber = await allocateGlobalRecordNumber('invoice');
    const result = await db
      .prepare(
        `INSERT INTO invoices (
           user_id, customer_id, source_platform, original_order_id, system_order_no,
           invoice_number, external_invoice_number, status, issue_date, due_date, notes,
           order_id, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
      )
      .run(
        userId,
        customerId,
        input.source_platform,
        input.original_order_id,
        input.system_order_no,
        invoiceNumber,
        externalInvoiceNumber,
        input.status,
        input.issue_date,
        input.due_date,
        `Synced from QuickBooks (ID ${input.original_order_id})`,
        orderId
      );

    const invoiceId = Number(result.lastInsertRowid);
    await db.prepare(
      `INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, amount)
       VALUES (?, ?, 1, ?, ?)`
    ).run(invoiceId, 'QuickBooks imported total', input.total_amount, input.total_amount);
    return invoiceId;
  });

  return { id: invoiceId, inserted: true, order_id: orderId };
}

export async function listHubOrders(userId: number): Promise<HubOrderRow[]> {
  const rows = await db
    .prepare(
      `SELECT o.id, o.source_platform, o.original_order_id, o.system_order_no, o.reference_number,
              o.name AS customer_name, o.total_amount, o.status, o.po_number,
              o.created_at, o.updated_at,
              i.id AS linked_invoice_id, i.invoice_number AS linked_invoice_number,
              i.external_invoice_number AS linked_external_invoice_number
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
    reference_number: (r.reference_number as string) || '',
    customer_name: (r.customer_name as string) || '',
    total_amount: r.total_amount as number | null,
    status: (r.status as string) || '',
    po_number: (r.po_number as string) || '',
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    linked_invoice_id: (r.linked_invoice_id as number) || null,
    linked_invoice_number: (r.linked_invoice_number as string) || null,
    linked_external_invoice_number: (r.linked_external_invoice_number as string) || null,
  }));
}

export async function getSyncState(userId: number, provider: string, storeKey: string): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT last_synced_at FROM integration_sync_state
       WHERE user_id = ? AND provider = ? AND store_key = ?`
    )
    .get(userId, provider, storeKey) as { last_synced_at: string | null } | undefined;
  return row?.last_synced_at ?? null;
}

export async function setSyncState(userId: number, provider: string, storeKey: string, syncedAt: string): Promise<void> {
  await db.prepare(
    `INSERT INTO integration_sync_state (user_id, provider, store_key, last_synced_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, provider, store_key)
     DO UPDATE SET last_synced_at = excluded.last_synced_at`
  ).run(userId, provider, storeKey, syncedAt);
}

async function userIdWithLatestWooSync(storeKey?: string): Promise<number | null> {
  const row = storeKey
    ? await db
        .prepare(
          `SELECT user_id FROM integration_sync_state
           WHERE provider = 'woocommerce' AND store_key = ? AND last_synced_at IS NOT NULL
           ORDER BY last_synced_at DESC LIMIT 1`
        )
        .get(storeKey)
    : await db
        .prepare(
          `SELECT user_id FROM integration_sync_state
           WHERE provider = 'woocommerce' AND last_synced_at IS NOT NULL
           ORDER BY last_synced_at DESC LIMIT 1`
        )
        .get();
  const userId = (row as { user_id?: number } | undefined)?.user_id;
  return typeof userId === 'number' && userId > 0 ? userId : null;
}

async function firstUserIdWithWooStores(userIds: number[]): Promise<number | null> {
  for (const id of userIds) {
    if ((await getWooStoreConfigs(id)).length > 0) return id;
  }
  return null;
}

export async function resolveHubOwnerUserId(): Promise<number> {
  const configured = Number(process.env.HUB_OWNER_USER_ID);
  if (Number.isFinite(configured) && configured > 0) return configured;

  // Prefer the account that last synced Nestiee (matches Order Hub "Last import").
  const nestieeSyncUser = await userIdWithLatestWooSync('nestiee');
  if (nestieeSyncUser) return nestieeSyncUser;

  const anyWooSyncUser = await userIdWithLatestWooSync();
  if (anyWooSyncUser) return anyWooSyncUser;

  const orgRoots = (
    await db.prepare('SELECT id FROM users WHERE owner_user_id IS NULL ORDER BY id').all()
  ) as { id: number }[];
  const rootWithWoo = await firstUserIdWithWooStores(orgRoots.map((r) => r.id));
  if (rootWithWoo) return rootWithWoo;

  const allUsers = (await db.prepare('SELECT id FROM users ORDER BY id').all()) as { id: number }[];
  const anyWithWoo = await firstUserIdWithWooStores(allUsers.map((r) => r.id));
  if (anyWithWoo) return anyWithWoo;

  const admin = await db.prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1").get() as
    | { id: number }
    | undefined;
  if (admin) return admin.id;

  const anyUser = await db.prepare('SELECT id FROM users ORDER BY id LIMIT 1').get() as { id: number } | undefined;
  if (!anyUser) throw new Error('No users in database — register an account first');
  return anyUser.id;
}
