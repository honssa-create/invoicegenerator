import db from './db';
import type { Order } from './orders';
import { getActivities, logActivity as logActivityUnified } from './activity';
import { getInvoiceWithDetails } from './invoices';

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
        ? [
            details.customer_name,
            details.customer_address,
            [details.customer_city, details.customer_state, details.customer_zip]
              .filter(Boolean)
              .join(', '),
            details.customer_email,
          ]
            .filter(Boolean)
            .join('\n')
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
    delivery_date: row.delivery_date || '',
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

export async function listOrders(userId: number): Promise<Order[]> {
  const rows = await db
    .prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY updated_at DESC, id DESC')
    .all(userId) as OrderRow[];
  const orders = await Promise.all(rows.map(async (r) => await hydrate(r, false)));
  if (!orders.length) return orders;

  const ids = orders.map((o) => o.id);
  const placeholders = ids.map(() => '?').join(', ');
  const fileRows = (await db
    .prepare(
      `SELECT id, order_id, path, original_name FROM order_files WHERE order_id IN (${placeholders}) ORDER BY id`
    )
    .all(...ids)) as Array<{ id: number; order_id: number; path: string; original_name: string | null }>;

  const byOrder = new Map<number, Order['files']>();
  for (const f of fileRows) {
    const list = byOrder.get(f.order_id) || [];
    list.push({ id: f.id, path: f.path, original_name: f.original_name });
    byOrder.set(f.order_id, list);
  }
  for (const order of orders) {
    order.files = byOrder.get(order.id) || [];
  }
  return orders;
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
