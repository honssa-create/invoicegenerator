import db from './db';
import type { PrepCapacity, PrepOrder, PrepOrderType, PrepStatus } from './kitchen-prep';
import { buildKitchenCompletionActivityBody, computePrepCalculation, isRedDateAllowed } from './kitchen-prep';
import { logActivity } from './activity';

interface PrepRow {
  id: number;
  user_id: number;
  order_code: string;
  linked_order_id: number | null;
  stewing_date: string;
  order_type: string;
  capacity: string;
  status: string;
  qty_osmanthus: number;
  qty_red_date: number;
  qty_rock_sugar: number;
  notes: string | null;
  expected_yield: number | null;
  actual_yield: number | null;
  completion_remarks: string | null;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
  updated_at: string;
}

function hydrate(row: PrepRow): PrepOrder {
  return {
    id: row.id,
    user_id: row.user_id,
    order_code: row.order_code,
    linked_order_id: row.linked_order_id,
    stewing_date: row.stewing_date,
    order_type: row.order_type as PrepOrder['order_type'],
    capacity: row.capacity as PrepCapacity,
    status: row.status as PrepStatus,
    qty_osmanthus: row.qty_osmanthus,
    qty_red_date: row.qty_red_date,
    qty_rock_sugar: row.qty_rock_sugar,
    notes: row.notes,
    expected_yield: row.expected_yield ?? null,
    actual_yield: row.actual_yield ?? null,
    completion_remarks: row.completion_remarks ?? null,
    completed_at: row.completed_at ?? null,
    completed_by: row.completed_by ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function nextOrderCode(userId: number): string {
  const row = db
    .prepare(
      `SELECT order_code FROM kitchen_prep_orders
       WHERE user_id = ? AND order_code LIKE 'PREP-%'
       ORDER BY id DESC LIMIT 1`
    )
    .get(userId) as { order_code: string } | undefined;
  let n = 1;
  if (row?.order_code) {
    const m = /PREP-(\d+)/.exec(row.order_code);
    if (m) n = Number(m[1]) + 1;
  }
  return `PREP-${String(n).padStart(4, '0')}`;
}

export function listPrepOrders(userId: number): PrepOrder[] {
  const rows = db
    .prepare(
      `SELECT * FROM kitchen_prep_orders WHERE user_id = ?
       ORDER BY stewing_date ASC, id ASC`
    )
    .all(userId) as PrepRow[];
  return rows.map(hydrate);
}

export function getPrepOrder(id: number | string, userId: number): PrepOrder | null {
  const row = db
    .prepare('SELECT * FROM kitchen_prep_orders WHERE id = ? AND user_id = ?')
    .get(id, userId) as PrepRow | undefined;
  return row ? hydrate(row) : null;
}

export function createPrepOrder(
  userId: number,
  input: {
    stewing_date: string;
    order_type: PrepOrderType;
    capacity: PrepCapacity;
    qty_osmanthus?: number;
    qty_red_date?: number;
    qty_rock_sugar?: number;
    linked_order_id?: number | null;
    order_code?: string;
    notes?: string | null;
    status?: PrepStatus;
  }
): PrepOrder {
  const capacity = input.capacity;
  const qtyRed = isRedDateAllowed(capacity) ? Math.max(0, input.qty_red_date ?? 0) : 0;
  const res = db
    .prepare(
      `INSERT INTO kitchen_prep_orders
         (user_id, order_code, linked_order_id, stewing_date, order_type, capacity, status,
          qty_osmanthus, qty_red_date, qty_rock_sugar, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      userId,
      input.order_code?.trim() || nextOrderCode(userId),
      input.linked_order_id ?? null,
      input.stewing_date,
      input.order_type,
      capacity,
      input.status || 'scheduled',
      Math.max(0, input.qty_osmanthus ?? 0),
      qtyRed,
      Math.max(0, input.qty_rock_sugar ?? 0),
      input.notes?.trim() || null
    );
  return getPrepOrder(Number(res.lastInsertRowid), userId)!;
}

export function updatePrepOrder(
  id: number | string,
  userId: number,
  input: Partial<{
    stewing_date: string;
    order_type: PrepOrderType;
    capacity: PrepCapacity;
    status: PrepStatus;
    qty_osmanthus: number;
    qty_red_date: number;
    qty_rock_sugar: number;
    notes: string | null;
  }>
): PrepOrder | null {
  const existing = getPrepOrder(id, userId);
  if (!existing) return null;

  const capacity = input.capacity ?? existing.capacity;
  const qtyRed = isRedDateAllowed(capacity)
    ? Math.max(0, input.qty_red_date ?? existing.qty_red_date)
    : 0;

  db.prepare(
    `UPDATE kitchen_prep_orders SET
       stewing_date = ?, order_type = ?, capacity = ?, status = ?,
       qty_osmanthus = ?, qty_red_date = ?, qty_rock_sugar = ?, notes = ?,
       updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`
  ).run(
    input.stewing_date ?? existing.stewing_date,
    input.order_type ?? existing.order_type,
    capacity,
    input.status ?? existing.status,
    Math.max(0, input.qty_osmanthus ?? existing.qty_osmanthus),
    qtyRed,
    Math.max(0, input.qty_rock_sugar ?? existing.qty_rock_sugar),
    input.notes !== undefined ? input.notes : existing.notes,
    id,
    userId
  );
  return getPrepOrder(id, userId);
}

export function deletePrepOrder(id: number | string, userId: number): boolean {
  const res = db.prepare('DELETE FROM kitchen_prep_orders WHERE id = ? AND user_id = ?').run(id, userId);
  return res.changes > 0;
}

export function completePrepProduction(
  id: number | string,
  userId: number,
  operatorName: string,
  input: { actual_yield: number; completion_remarks?: string | null }
): PrepOrder | null {
  const existing = getPrepOrder(id, userId);
  if (!existing) return null;
  if (existing.status === 'completed') return null;

  const calculation = computePrepCalculation(existing.capacity, existing.order_type, {
    osmanthus: existing.qty_osmanthus,
    red_date: existing.qty_red_date,
    rock_sugar: existing.qty_rock_sugar,
  });
  const expectedYield = calculation.totals.bottles;
  const actualYield = Math.max(0, Math.round(input.actual_yield));
  const remarks = input.completion_remarks?.trim() || null;

  db.prepare(
    `UPDATE kitchen_prep_orders SET
       status = 'completed',
       expected_yield = ?,
       actual_yield = ?,
       completion_remarks = ?,
       completed_at = datetime('now'),
       completed_by = ?,
       updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`
  ).run(expectedYield, actualYield, remarks, operatorName, id, userId);

  const activityBody = buildKitchenCompletionActivityBody(
    existing.order_code,
    expectedYield,
    actualYield,
    remarks
  );

  if (existing.linked_order_id) {
    logActivity('order', existing.linked_order_id, userId, 'activity', operatorName, activityBody);
  }

  return getPrepOrder(id, userId);
}

/** Import a bird's-nest order (燕窩回禮燉製) into the prep schedule. */
export function importFromOrder(userId: number, orderId: number): PrepOrder | null {
  const order = db
    .prepare('SELECT id, po_number, fields_json FROM orders WHERE id = ? AND user_id = ?')
    .get(orderId, userId) as { id: number; po_number: string | null; fields_json: string } | undefined;
  if (!order) return null;

  let fields: Record<string, string> = {};
  try {
    fields = order.fields_json ? JSON.parse(order.fields_json) : {};
  } catch {
    fields = {};
  }

  const n = (k: string) => {
    const v = Number(fields[k]);
    return Number.isFinite(v) ? v : 0;
  };

  const stewingDate =
    fields.production_date || fields.client_delivery_date || new Date().toISOString().slice(0, 10);
  const isWedding = Boolean(fields.big_day) || fields.order_subtype === 'wedding';

  return createPrepOrder(userId, {
    stewing_date: stewingDate,
    order_type: isWedding ? 'wedding' : 'daily',
    capacity: '45g',
    qty_osmanthus: n('qty_osmanthus'),
    qty_red_date: n('qty_red_date'),
    qty_rock_sugar: n('qty_rock_sugar'),
    linked_order_id: order.id,
    order_code: order.po_number?.trim() || undefined,
    notes: null,
  });
}
