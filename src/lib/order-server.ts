import db from './db';
import type { Order } from './orders';

interface OrderRow {
  id: number;
  user_id: number;
  po_number: string | null;
  name: string | null;
  description: string | null;
  status: string | null;
  delivery_date: string | null;
  customer_email: string | null;
  phone: string | null;
  shipping_address: string | null;
  notes: string | null;
  fields_json: string | null;
  created_at: string;
  updated_at: string;
}

function hydrate(row: OrderRow, withRelations: boolean): Order {
  let fields: Record<string, string | boolean> = {};
  try {
    fields = row.fields_json ? JSON.parse(row.fields_json) : {};
  } catch {
    fields = {};
  }

  const files = withRelations
    ? (db
        .prepare('SELECT id, path, original_name FROM order_files WHERE order_id = ? ORDER BY id')
        .all(row.id) as Order['files'])
    : [];

  const activities = withRelations
    ? (db
        .prepare(
          'SELECT id, kind, author, body, created_at FROM order_activities WHERE order_id = ? ORDER BY created_at ASC, id ASC'
        )
        .all(row.id) as Order['activities'])
    : [];

  return {
    id: row.id,
    user_id: row.user_id,
    po_number: row.po_number || '',
    name: row.name || '',
    description: row.description || '',
    status: row.status || '草稿',
    delivery_date: row.delivery_date || '',
    customer_email: row.customer_email || '',
    phone: row.phone || '',
    shipping_address: row.shipping_address || '',
    notes: row.notes || '',
    fields,
    files,
    activities,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function getOrder(id: number | string, userId: number): Order | null {
  const row = db
    .prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?')
    .get(id, userId) as OrderRow | undefined;
  return row ? hydrate(row, true) : null;
}

export function listOrders(userId: number): Order[] {
  const rows = db
    .prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY updated_at DESC, id DESC')
    .all(userId) as OrderRow[];
  return rows.map((r) => hydrate(r, false));
}

export function logActivity(
  orderId: number | string,
  userId: number,
  kind: 'comment' | 'activity',
  author: string,
  body: string
) {
  db.prepare(
    'INSERT INTO order_activities (order_id, user_id, kind, author, body) VALUES (?, ?, ?, ?, ?)'
  ).run(orderId, userId, kind, author, body);
}
