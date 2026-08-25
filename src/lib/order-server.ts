import db from './db';
import type { Order } from './orders';
import { orderDueDate } from './orders';
import { getActivities, logActivity as logActivityUnified } from './activity';
import { getInvoiceWithDetails } from './invoices';
import { formatCustomerPartyBlock } from './customer-party';

interface OrderRow {
  id: number;
  user_id: number;
  reference_number: string;
  po_number: string | null;
  name: string | null;
  description: string | null;
  status: string | null;
  delivery_date: string | null;
  customer_email: string | null;
  phone: string | null;
  shipping_address: string | null;
  notes: string | null;
  carton_count: string | null;
  quotation_id: number | null;
  total_amount: number | null;
  fields_json: string | null;
  created_at: string;
  updated_at: string;
}

async function hydrate(row: OrderRow, withRelations: boolean): Promise<Order> {
  let fields: Record<string, string | boolean> = {};
  try {
    fields = row.fields_json ? JSON.parse(row.fields_json) : {};
  } catch {
    fields = {};
  }

  const files = withRelations
    ? (await db
        .prepare('SELECT id, path, original_name FROM order_files WHERE order_id = ? ORDER BY id')
        .all(row.id) as Order['files'])
    : [];

  const activities = withRelations ? (await getActivities('order', row.id) as Order['activities']) : [];

  let linkedInvoice: Order['linked_invoice'] = null;
  if (withRelations) {
    const invRow = await db
      .prepare('SELECT id, invoice_number, status FROM invoices WHERE order_id = ? ORDER BY id DESC LIMIT 1')
      .get(row.id) as { id: number; invoice_number: string; status: string } | undefined;
    if (invRow) {
      const details = await getInvoiceWithDetails(invRow.id, row.user_id);
      const billingFromInvoice = details?.billing_address?.trim() || '';
      const billingFallback = details
        ? formatCustomerPartyBlock({
            name: details.customer_name,
            companyName: details.customer_company_name,
            phone: details.customer_phone,
            email: details.email?.trim() || details.customer_email,
            address: details.customer_address,
          })
        : '';
      linkedInvoice = {
        id: invRow.id,
        invoice_number: invRow.invoice_number,
        status: invRow.status,
        total: details?.total ?? null,
        billing_address: billingFromInvoice || billingFallback || null,
      };
    }
  }

  const linkedQuotation =
    withRelations && row.quotation_id
      ? (await db
          .prepare('SELECT id, quote_number, status FROM quotations WHERE id = ? AND user_id = ?')
          .get(row.quotation_id, row.user_id) as Order['linked_quotation'] | undefined) || null
      : null;

  return {
    id: row.id,
    user_id: row.user_id,
    reference_number: row.reference_number,
    po_number: row.po_number || '',
    name: row.name || '',
    description: row.description || '',
    status: row.status || 'OPEN',
    // Derived from fields (due_date / client_delivery_date); legacy DB column is fallback only.
    delivery_date: orderDueDate({ fields }) || row.delivery_date || '',
    customer_email: row.customer_email || '',
    phone: row.phone || '',
    shipping_address: row.shipping_address || '',
    notes: row.notes || '',
    carton_count: row.carton_count || '',
    quotation_id: row.quotation_id || null,
    total_amount: row.total_amount != null ? Number(row.total_amount) : null,
    fields,
    files,
    activities,
    linked_invoice: linkedInvoice,
    linked_quotation: linkedQuotation,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function getOrder(id: number | string, userId: number): Promise<Order | null> {
  const row = await db
    .prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?')
    .get(id, userId) as OrderRow | undefined;
  return row ? await hydrate(row, true) : null;
}

/** List orders without order_files / activities / linked docs (detail uses getOrder). */
export async function listOrders(userId: number): Promise<Order[]> {
  const rows = await db
    .prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY updated_at DESC, id DESC')
    .all(userId) as OrderRow[];
  return Promise.all(rows.map((r) => hydrate(r, false)));
}

/** Field keys needed by board/table/accounting/cashflow — not honour_lines / nestiee blobs. */
const LIST_FIELD_KEYS = [
  'order_type',
  'due_date',
  'client_delivery_date',
  'honour_lines',
  'nestiee_lines',
  'cupmoka_lines',
  'tracking_no',
  'payment_status_label',
  'qty_rock_sugar',
  'qty_osmanthus',
  'qty_red_date',
  'payment_amount', 'payment1_amount', 'payment2_amount', 'payment3_amount',
  'payment_date', 'payment_bank', 'payment_method_detail', 'payment_reference',
  'payment_receipt_path', 'payment_verified',
  'payment2_date', 'payment2_bank', 'payment2_method_detail', 'payment2_reference',
  'payment2_receipt_path', 'payment2_verified',
  'payment3_date', 'payment3_bank', 'payment3_method_detail', 'payment3_reference',
  'payment3_receipt_path', 'payment3_verified',
] as const;

type ListFieldKey = (typeof LIST_FIELD_KEYS)[number];

/** Postgres jsonb → text for list keys (avoids shipping/parsing honour_lines / nestiee blobs). */
const LIST_FIELD_SQL = LIST_FIELD_KEYS.map(
  (k) => `j.fj->>'${k}' AS f_${k}`
).join(',\n       ');

interface LeanOrderRow {
  id: number;
  user_id: number;
  reference_number: string;
  po_number: string | null;
  name: string | null;
  description: string | null;
  status: string | null;
  delivery_date: string | null;
  customer_email: string | null;
  phone: string | null;
  shipping_address: string | null;
  notes: string | null;
  carton_count: string | null;
  quotation_id: number | null;
  total_amount: number | null;
  created_at: string;
  updated_at: string;
  f_order_type: string | null;
  f_due_date: string | null;
  f_client_delivery_date: string | null;
  f_honour_lines: string | null;
  f_nestiee_lines: string | null;
  f_cupmoka_lines: string | null;
  f_tracking_no: string | null;
  f_payment_status_label: string | null;
  f_qty_rock_sugar: string | null;
  f_qty_osmanthus: string | null;
  f_qty_red_date: string | null;
  f_payment_amount: string | null;
  f_payment1_amount: string | null;
  f_payment2_amount: string | null;
  f_payment3_amount: string | null;
  f_payment_date: string | null;
  f_payment_bank: string | null;
  f_payment_method_detail: string | null;
  f_payment_reference: string | null;
  f_payment_receipt_path: string | null;
  f_payment_verified: string | null;
  f_payment2_date: string | null;
  f_payment2_bank: string | null;
  f_payment2_method_detail: string | null;
  f_payment2_reference: string | null;
  f_payment2_receipt_path: string | null;
  f_payment2_verified: string | null;
  f_payment3_date: string | null;
  f_payment3_bank: string | null;
  f_payment3_method_detail: string | null;
  f_payment3_reference: string | null;
  f_payment3_receipt_path: string | null;
  f_payment3_verified: string | null;
}

function leanRowToOrder(row: LeanOrderRow): Order {
  const fields: Record<string, string | boolean> = {};
  const set = (key: ListFieldKey, raw: string | null) => {
    if (raw == null || raw === '') return;
    if (key.endsWith('_verified')) {
      fields[key] = raw === 'true' || raw === '1';
      return;
    }
    fields[key] = raw;
  };
  set('order_type', row.f_order_type);
  set('due_date', row.f_due_date);
  set('client_delivery_date', row.f_client_delivery_date);
  set('honour_lines', row.f_honour_lines);
  set('nestiee_lines', row.f_nestiee_lines);
  set('cupmoka_lines', row.f_cupmoka_lines);
  set('tracking_no', row.f_tracking_no);
  set('payment_status_label', row.f_payment_status_label);
  set('qty_rock_sugar', row.f_qty_rock_sugar);
  set('qty_osmanthus', row.f_qty_osmanthus);
  set('qty_red_date', row.f_qty_red_date);
  set('payment_amount', row.f_payment_amount);
  set('payment1_amount', row.f_payment1_amount);
  set('payment2_amount', row.f_payment2_amount);
  set('payment3_amount', row.f_payment3_amount);
  set('payment_date', row.f_payment_date);
  set('payment_bank', row.f_payment_bank);
  set('payment_method_detail', row.f_payment_method_detail);
  set('payment_reference', row.f_payment_reference);
  set('payment_receipt_path', row.f_payment_receipt_path);
  set('payment_verified', row.f_payment_verified);
  set('payment2_date', row.f_payment2_date);
  set('payment2_bank', row.f_payment2_bank);
  set('payment2_method_detail', row.f_payment2_method_detail);
  set('payment2_reference', row.f_payment2_reference);
  set('payment2_receipt_path', row.f_payment2_receipt_path);
  set('payment2_verified', row.f_payment2_verified);
  set('payment3_date', row.f_payment3_date);
  set('payment3_bank', row.f_payment3_bank);
  set('payment3_method_detail', row.f_payment3_method_detail);
  set('payment3_reference', row.f_payment3_reference);
  set('payment3_receipt_path', row.f_payment3_receipt_path);
  set('payment3_verified', row.f_payment3_verified);

  return {
    id: row.id,
    user_id: row.user_id,
    reference_number: row.reference_number,
    po_number: row.po_number || '',
    name: row.name || '',
    description: row.description || '',
    status: row.status || 'OPEN',
    delivery_date: orderDueDate({ fields }) || row.delivery_date || '',
    customer_email: row.customer_email || '',
    phone: row.phone || '',
    shipping_address: row.shipping_address || '',
    notes: row.notes || '',
    carton_count: row.carton_count || '',
    quotation_id: row.quotation_id || null,
    total_amount: row.total_amount != null ? Number(row.total_amount) : null,
    fields,
    files: [],
    activities: [],
    linked_invoice: null,
    linked_quotation: null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export type ListOrdersSummaryOpts = {
  /** YYYY-MM — only orders whose payment_date (or created_at fallback) falls in this month. */
  paymentMonth?: string;
  /** Only orders that have any primary payment field set (accounting ledger). */
  withPaymentFields?: boolean;
};

/**
 * Lean list for table/board/accounting/cashflow: core columns + list field keys via jsonb,
 * without parsing full fields_json blobs in Node.
 */
export async function listOrdersSummary(
  userId: number,
  opts: ListOrdersSummaryOpts = {}
): Promise<Order[]> {
  const params: (string | number)[] = [userId];
  let whereExtra = '';

  if (opts.paymentMonth && /^\d{4}-\d{2}$/.test(opts.paymentMonth)) {
    whereExtra += ` AND (
      (NULLIF(j.fj->>'payment_date', '') IS NOT NULL AND (j.fj->>'payment_date') LIKE ?)
      OR (
        (j.fj->>'payment_date' IS NULL OR j.fj->>'payment_date' = '')
        AND o.created_at LIKE ?
      )
    )`;
    params.push(`${opts.paymentMonth}%`, `${opts.paymentMonth}%`);
  }

  if (opts.withPaymentFields) {
    whereExtra += ` AND (
      NULLIF(j.fj->>'payment_amount', '') IS NOT NULL
      OR NULLIF(j.fj->>'payment_date', '') IS NOT NULL
      OR NULLIF(j.fj->>'payment_bank', '') IS NOT NULL
      OR NULLIF(j.fj->>'payment_method_detail', '') IS NOT NULL
      OR NULLIF(j.fj->>'payment_reference', '') IS NOT NULL
      OR NULLIF(j.fj->>'payment_receipt_path', '') IS NOT NULL
      OR NULLIF(j.fj->>'payment2_amount', '') IS NOT NULL
      OR NULLIF(j.fj->>'payment2_date', '') IS NOT NULL
      OR NULLIF(j.fj->>'payment2_bank', '') IS NOT NULL
      OR NULLIF(j.fj->>'payment2_reference', '') IS NOT NULL
      OR NULLIF(j.fj->>'payment2_receipt_path', '') IS NOT NULL
      OR NULLIF(j.fj->>'payment3_amount', '') IS NOT NULL
      OR NULLIF(j.fj->>'payment3_date', '') IS NOT NULL
      OR NULLIF(j.fj->>'payment3_bank', '') IS NOT NULL
      OR NULLIF(j.fj->>'payment3_reference', '') IS NOT NULL
      OR NULLIF(j.fj->>'payment3_receipt_path', '') IS NOT NULL
    )`;
  }

  const rows = (await db
    .prepare(
      `SELECT o.id, o.user_id, o.reference_number, o.po_number, o.name, o.description, o.status,
              o.delivery_date, o.customer_email, o.phone, o.shipping_address, o.notes, o.carton_count,
              o.quotation_id, o.total_amount, o.created_at, o.updated_at,
              ${LIST_FIELD_SQL}
       FROM orders o
       LEFT JOIN LATERAL (
         SELECT CASE
           WHEN o.fields_json IS NULL OR btrim(o.fields_json) = '' THEN '{}'::jsonb
           ELSE o.fields_json::jsonb
         END AS fj
       ) AS j ON true
       WHERE o.user_id = ?${whereExtra}
       ORDER BY o.updated_at DESC, o.id DESC`
    )
    .all(...params)) as LeanOrderRow[];

  return rows.map(leanRowToOrder);
}

/** Dropdown options for linking orders to invoices (id + labels only). */
export async function listOrderOptions(
  userId: number
): Promise<{ id: number; reference_number: string; po_number: string; name: string }[]> {
  return (await db
    .prepare(
      `SELECT id, reference_number, COALESCE(po_number, '') AS po_number, COALESCE(name, '') AS name
       FROM orders WHERE user_id = ? ORDER BY updated_at DESC, id DESC`
    )
    .all(userId)) as { id: number; reference_number: string; po_number: string; name: string }[];
}

export async function logActivity(
  orderId: number | string,
  userId: number,
  kind: 'comment' | 'activity',
  author: string,
  body: string
) {
  await logActivityUnified('order', orderId, userId, kind, author, body);
}
