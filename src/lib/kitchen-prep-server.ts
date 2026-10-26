import db from './db';
import { trashKitchenPrep } from '@/lib/trash';
import type {
  PrepCalculation,
  PrepCapacity,
  PrepCompletionSplit,
  PrepFlavor,
  PrepOrder,
  PrepOrderType,
  PrepStatus,
} from './kitchen-prep';
import {
  PREP_FLAVORS,
  buildKitchenCompletionActivityBody,
  computePrepCalculationForOrder,
  prepCustomerOrderKey,
  resolvePrepBatch,
  computeStewingRawNeeds,
  defaultCompletionSplits,
  defaultPrepStatusForCreate,
  hkTodayIso,
  isRedDateAllowed,
  nextActualQty,
  parseBirdNestType,
  parsePrepLinesJson,
  parsePrepScheduleSlot,
  planPrepBatchOrderCode,
  planPrepCapacityLines,
  prepOrderBirdNestSelections,
  prepOrderLines,
  sumRawNeedLines,
  validatePrepFlavorQtys,
  weddingPrepStatusFromDate,
  hkNowDateTime,
  nextStewingStartedAt,
  type BirdNestType,
  type PrepBatchView,
  type PrepCapacityLineDraft,
  type PrepScheduleSlot,
  type StewFormulaMapLike,
} from './kitchen-prep';
import { isWeddingGiftOrderType, mapWeddingCapacityToPrep } from './orders';
import { addCalendarDays } from './wedding-gift-confirmation';
import { logActivity } from './activity';
import { finishedSku } from './kitchen-bom';
import { addFinishedFromStewing, resolveKitchenOwnerUserId } from './kitchen-server';
import type { KitchenFormulas } from './kitchen-catalog';
import {
  readKitchenCapacityOptions,
  readKitchenPrepDetailContext,
  readKitchenStewFormulas,
} from './kitchen-catalog-server';

type StewFormulas = KitchenFormulas['stewFormulas'];

export { resolveKitchenOwnerUserId };

function normalizeCompletionSplits(
  input: PrepCompletionSplit[] | undefined,
  existing: PrepOrder
): PrepCompletionSplit[] {
  if (input && input.length > 0) {
    return input.map((s, i) => {
      const flavor =
        s.flavor && (PREP_FLAVORS as readonly string[]).includes(s.flavor)
          ? s.flavor
          : null;
      const capacity = typeof s.capacity === 'string' && s.capacity.trim() ? s.capacity.trim() : undefined;
      return {
        label: s.label?.trim() || `Sub-order ${i + 1}`,
        qty: Math.max(0, Math.round(s.qty)),
        flavor: flavor || undefined,
        capacity,
      };
    });
  }
  return defaultCompletionSplits(computePrepCalculationForOrder(existing), existing.capacity);
}

interface PrepRow {
  id: number;
  user_id: number;
  order_code: string;
  linked_order_id: number | null;
  stewing_date: string;
  schedule_slot: string | null;
  order_type: string;
  capacity: string;
  status: string;
  qty_osmanthus: number;
  qty_red_date: number;
  qty_rock_sugar: number;
  actual_qty_osmanthus: number | null;
  actual_qty_red_date: number | null;
  actual_qty_rock_sugar: number | null;
  bird_nest_osmanthus: string | null;
  bird_nest_red_date: string | null;
  bird_nest_rock_sugar: string | null;
  notes: string | null;
  expected_yield: number | null;
  actual_yield: number | null;
  completion_remarks: string | null;
  completed_at: string | null;
  completed_by: string | null;
  stewing_started_at: string | null;
  completion_splits_json: string | null;
  /** JSON array of capacity lines. Null on single-capacity rows (parent columns are the line). */
  lines_json: string | null;
  created_at: string;
  updated_at: string;
}

function parseSplits(raw: string | null): PrepCompletionSplit[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PrepCompletionSplit[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function hydrate(row: PrepRow): PrepOrder {
  const base: PrepOrder = {
    id: row.id,
    user_id: row.user_id,
    order_code: row.order_code,
    linked_order_id: row.linked_order_id,
    stewing_date: row.stewing_date,
    schedule_slot: parsePrepScheduleSlot(row.schedule_slot),
    order_type: row.order_type as PrepOrder['order_type'],
    capacity: row.capacity as PrepCapacity,
    status: row.status as PrepStatus,
    qty_osmanthus: row.qty_osmanthus,
    qty_red_date: row.qty_red_date,
    qty_rock_sugar: row.qty_rock_sugar,
    actual_qty_osmanthus: row.actual_qty_osmanthus ?? null,
    actual_qty_red_date: row.actual_qty_red_date ?? null,
    actual_qty_rock_sugar: row.actual_qty_rock_sugar ?? null,
    bird_nest_osmanthus: parseBirdNestType(row.bird_nest_osmanthus),
    bird_nest_red_date: parseBirdNestType(row.bird_nest_red_date),
    bird_nest_rock_sugar: parseBirdNestType(row.bird_nest_rock_sugar),
    notes: row.notes,
    expected_yield: row.expected_yield ?? null,
    actual_yield: row.actual_yield ?? null,
    completion_remarks: row.completion_remarks ?? null,
    completed_at: row.completed_at ?? null,
    completed_by: row.completed_by ?? null,
    stewing_started_at: row.stewing_started_at ?? null,
    completion_splits: parseSplits(row.completion_splits_json),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  const stored = parsePrepLinesJson(row.lines_json);
  return {
    ...base,
    lines: stored && stored.length ? stored : prepOrderLines(base),
  };
}

async function nextPrepSerialStart(): Promise<number> {
  const row = (await db
    .prepare(
      `SELECT order_code FROM kitchen_prep_orders
       WHERE order_code LIKE 'PREP-%'
       ORDER BY id DESC LIMIT 1`
    )
    .get()) as { order_code: string } | undefined;
  let n = 1;
  if (row?.order_code) {
    const m = /PREP-(\d+)/.exec(row.order_code);
    if (m) n = Number(m[1]) + 1;
  }
  return n;
}

async function nextOrderCode(_userId?: number): Promise<string> {
  const n = await nextPrepSerialStart();
  return `PREP-${String(n).padStart(4, '0')}`;
}

type InsertPrepInput = {
  stewing_date: string;
  schedule_slot: PrepScheduleSlot | null;
  order_type: PrepOrderType;
  capacity: PrepCapacity;
  qty_osmanthus: number;
  qty_red_date: number;
  qty_rock_sugar: number;
  actual_qty_osmanthus: number;
  actual_qty_red_date: number;
  actual_qty_rock_sugar: number;
  linked_order_id: number | null;
  order_code: string;
  notes: string | null;
  status: PrepStatus;
  bird_nest_osmanthus: BirdNestType;
  bird_nest_red_date: BirdNestType;
  bird_nest_rock_sugar: BirdNestType;
  lines_json: string | null;
};

async function insertPrepOrderRow(userId: number, row: InsertPrepInput): Promise<number> {
  const res = await db
    .prepare(
      `INSERT INTO kitchen_prep_orders
         (user_id, order_code, linked_order_id, stewing_date, schedule_slot, order_type, capacity, status,
          qty_osmanthus, qty_red_date, qty_rock_sugar,
          actual_qty_osmanthus, actual_qty_red_date, actual_qty_rock_sugar,
          bird_nest_osmanthus, bird_nest_red_date, bird_nest_rock_sugar,
          lines_json, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    )
    .run(
      userId,
      row.order_code,
      row.linked_order_id,
      row.stewing_date,
      row.schedule_slot,
      row.order_type,
      row.capacity,
      row.status,
      row.qty_osmanthus,
      row.qty_red_date,
      row.qty_rock_sugar,
      row.actual_qty_osmanthus,
      row.actual_qty_red_date,
      row.actual_qty_rock_sugar,
      row.bird_nest_osmanthus,
      row.bird_nest_red_date,
      row.bird_nest_rock_sugar,
      row.lines_json,
      row.notes,
    );
  return Number(res.lastInsertRowid);
}

function prepOrderFromInsert(userId: number, id: number, row: InsertPrepInput): PrepOrder {
  return {
    id,
    user_id: userId,
    order_code: row.order_code,
    linked_order_id: row.linked_order_id,
    stewing_date: row.stewing_date,
    schedule_slot: row.schedule_slot,
    order_type: row.order_type,
    capacity: row.capacity,
    status: row.status,
    qty_osmanthus: row.qty_osmanthus,
    qty_red_date: row.qty_red_date,
    qty_rock_sugar: row.qty_rock_sugar,
    actual_qty_osmanthus: row.actual_qty_osmanthus,
    actual_qty_red_date: row.actual_qty_red_date,
    actual_qty_rock_sugar: row.actual_qty_rock_sugar,
    bird_nest_osmanthus: row.bird_nest_osmanthus,
    bird_nest_red_date: row.bird_nest_red_date,
    bird_nest_rock_sugar: row.bird_nest_rock_sugar,
    lines: prepOrderLines({
      capacity: row.capacity,
      qty_osmanthus: row.qty_osmanthus,
      qty_red_date: row.qty_red_date,
      qty_rock_sugar: row.qty_rock_sugar,
      actual_qty_osmanthus: row.actual_qty_osmanthus,
      actual_qty_red_date: row.actual_qty_red_date,
      actual_qty_rock_sugar: row.actual_qty_rock_sugar,
      bird_nest_osmanthus: row.bird_nest_osmanthus,
      bird_nest_red_date: row.bird_nest_red_date,
      bird_nest_rock_sugar: row.bird_nest_rock_sugar,
      lines_json: row.lines_json,
    }),
    notes: row.notes,
    expected_yield: null,
    actual_yield: null,
    completion_remarks: null,
    completed_at: null,
    completed_by: null,
    stewing_started_at: null,
    completion_splits: null,
    created_at: '',
    updated_at: '',
  };
}

/** List table + completion modal from list — omits notes / completion meta / timestamps. */
const PREP_LIST_COLUMNS = `id, user_id, order_code, linked_order_id, stewing_date, schedule_slot, order_type, capacity, status,
  qty_osmanthus, qty_red_date, qty_rock_sugar, actual_qty_osmanthus, actual_qty_red_date, actual_qty_rock_sugar,
  bird_nest_osmanthus, bird_nest_red_date, bird_nest_rock_sugar, lines_json,
  expected_yield, actual_yield, stewing_started_at`;

type ListPrepRow = Omit<
  PrepRow,
  'notes' | 'completion_remarks' | 'completed_at' | 'completed_by' | 'completion_splits_json' | 'created_at' | 'updated_at'
>;

export type ListPrepOrdersOpts = {
  dateStart?: string;
  dateEnd?: string;
  /** When true, omit completed rows (matches default “active” list filter). */
  excludeCompleted?: boolean;
  /** Exact status match (e.g. scheduled). */
  status?: PrepStatus;
};

function hydrateListRow(row: ListPrepRow): PrepOrder {
  const order = hydrate({
    ...row,
    notes: null,
    completion_remarks: null,
    completed_at: null,
    completed_by: null,
    completion_splits_json: null,
    created_at: '',
    updated_at: '',
  });
  return { ...order, completion_splits: null };
}

/** Org kitchen prep rows (kitchen owner), optional stewing_date range. */
export async function listPrepOrders(
  ownerId: number,
  opts: ListPrepOrdersOpts = {},
): Promise<PrepOrder[]> {
  const params: (string | number)[] = [ownerId];
  let where = 'WHERE user_id = ?';
  const dateStart = opts.dateStart?.trim() || '';
  const dateEnd = opts.dateEnd?.trim() || '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStart)) {
    where += ' AND stewing_date >= ?';
    params.push(dateStart);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateEnd)) {
    where += ' AND stewing_date <= ?';
    params.push(dateEnd);
  }
  if (opts.status) {
    where += ' AND status = ?';
    params.push(opts.status);
  } else if (opts.excludeCompleted) {
    where += " AND status != 'completed'";
  }
  const rows = (await db
    .prepare(
      `SELECT ${PREP_LIST_COLUMNS} FROM kitchen_prep_orders
       ${where}
       ORDER BY stewing_date ASC,
         CASE schedule_slot WHEN 'AM' THEN 0 WHEN 'PM' THEN 1 ELSE 2 END ASC,
         id ASC`
    )
    .all(...params)) as ListPrepRow[];
  return rows.map(hydrateListRow);
}

export async function listPrepOrdersWithCapacities(
  ownerId: number,
  opts: ListPrepOrdersOpts = {},
  includeCapacities = true,
): Promise<{
  orders: PrepOrder[];
  capacities: Array<{ id: string; label: string; sortOrder: number }> | null;
}> {
  const [orders, capacities] = await Promise.all([
    listPrepOrders(ownerId, opts),
    includeCapacities ? readKitchenCapacityOptions(ownerId) : Promise.resolve(null),
  ]);
  return { orders, capacities };
}

export async function getPrepOrder(id: number | string): Promise<PrepOrder | null> {
  const row = (await db
    .prepare('SELECT * FROM kitchen_prep_orders WHERE id = ?')
    .get(id)) as PrepRow | undefined;
  return row ? hydrate(row) : null;
}

async function getPrepOrdersByIds(ids: number[]): Promise<Map<number, PrepOrder>> {
  const unique = Array.from(new Set(ids.filter((id) => Number.isFinite(id) && id > 0)));
  if (unique.length === 0) return new Map();
  const placeholders = unique.map(() => '?').join(', ');
  const rows = (await db
    .prepare(`SELECT * FROM kitchen_prep_orders WHERE id IN (${placeholders})`)
    .all(...unique)) as PrepRow[];
  return new Map(rows.map((row) => [row.id, hydrate(row)]));
}

export type PrepOrderDetailPayload = {
  order: PrepOrder;
  calculation: PrepCalculation;
  capacities: Array<{ id: string; label: string; active?: boolean }>;
  batch: PrepBatchView;
  stewFormulas: StewFormulaMapLike;
};

function prepCodeLikePrefix(base: string): string {
  return `${base.replace(/[\\%_]/g, (ch) => `\\${ch}`)}-%`;
}

/** Sibling stew batches for 上單已燉 / -0N單. Same linked sales order, or the same order-code key. */
export async function loadPrepBatchView(order: PrepOrder): Promise<PrepBatchView> {
  const base = prepCustomerOrderKey(order.order_code);
  const linked = order.linked_order_id;
  const rows = (await db
    .prepare(
      `SELECT * FROM kitchen_prep_orders
       WHERE user_id = ?
         AND (
           (?::int IS NOT NULL AND linked_order_id = ?::int)
           OR order_code = ?
           OR order_code = ?
           OR order_code LIKE ? ESCAPE '\\'
         )`
    )
    .all(
      order.user_id,
      linked,
      linked,
      order.order_code,
      base,
      base ? prepCodeLikePrefix(base) : '!none!',
    )) as PrepRow[];
  const siblings = rows.map(hydrate);
  if (!siblings.some((row) => row.id === order.id)) siblings.push(order);
  return resolvePrepBatch(order.id, siblings);
}

/** Kitchen prep detail API — minimal DB round-trips (order + one settings read). */
export async function loadPrepOrderDetail(
  id: number | string,
): Promise<PrepOrderDetailPayload | null> {
  const [ownerId, order] = await Promise.all([
    resolveKitchenOwnerUserId(),
    getPrepOrder(id),
  ]);
  if (!order || order.user_id !== ownerId) return null;

  const [{ formulas, capacities }, batch] = await Promise.all([
    readKitchenPrepDetailContext(ownerId),
    loadPrepBatchView(order),
  ]);
  const calculation = computePrepCalculationForOrder(order, formulas.stewFormulas);
  return {
    order,
    calculation,
    capacities: capacities.map((c) => ({ id: c.id, label: c.label, active: c.active !== false })),
    batch,
    stewFormulas: formulas.stewFormulas,
  };
}

export async function createPrepOrder(
  userId: number,
  input: {
    stewing_date: string;
    /** Omitted on wedding auto-create so the row stays unset. */
    schedule_slot?: PrepScheduleSlot | null;
    order_type: PrepOrderType;
    capacity: PrepCapacity;
    qty_osmanthus?: number;
    qty_red_date?: number;
    qty_rock_sugar?: number;
    actual_qty_osmanthus?: number | null;
    actual_qty_red_date?: number | null;
    actual_qty_rock_sugar?: number | null;
    linked_order_id?: number | null;
    order_code?: string;
    notes?: string | null;
    status?: PrepStatus;
    bird_nest_osmanthus?: BirdNestType;
    bird_nest_red_date?: BirdNestType;
    bird_nest_rock_sugar?: BirdNestType;
    /** Linked 回禮 auto-create may have qtys filled later. */
    allowEmptyQtys?: boolean;
  },
  opts?: {
    stewFormulas?: StewFormulas;
    orderCode?: string;
    /** When false, returns row built from insert (avoids extra SELECT). */
    refetch?: boolean;
  },
): Promise<PrepOrder> {
  const stew = opts?.stewFormulas ?? (await readKitchenStewFormulas(userId)).stewFormulas;
  const capacity = input.capacity;
  const qtyOsmanthus = Math.max(0, input.qty_osmanthus ?? 0);
  const qtyRed = isRedDateAllowed(capacity, stew) ? Math.max(0, input.qty_red_date ?? 0) : 0;
  const qtyRock = Math.max(0, input.qty_rock_sugar ?? 0);
  const actualOsmanthus = Math.max(0, input.actual_qty_osmanthus ?? qtyOsmanthus);
  const actualRed = isRedDateAllowed(capacity, stew) ? Math.max(0, input.actual_qty_red_date ?? qtyRed) : 0;
  const actualRock = Math.max(0, input.actual_qty_rock_sugar ?? qtyRock);

  const validationErr = validatePrepFlavorQtys(
    capacity,
    {
      osmanthus: qtyOsmanthus,
      red_date: qtyRed,
      rock_sugar: qtyRock,
    },
    { allowEmpty: Boolean(input.allowEmptyQtys), formulas: stew }
  );
  if (validationErr) throw new Error(validationErr);

  const status =
    input.status ??
    defaultPrepStatusForCreate(input.order_type, input.stewing_date, {
      hasProductionDate: true,
    });

  const orderCode =
    input.order_code?.trim() || opts?.orderCode || (await nextOrderCode(userId));

  const insertRow: InsertPrepInput = {
    stewing_date: input.stewing_date,
    schedule_slot: input.schedule_slot ?? null,
    order_type: input.order_type,
    capacity,
    qty_osmanthus: qtyOsmanthus,
    qty_red_date: qtyRed,
    qty_rock_sugar: qtyRock,
    actual_qty_osmanthus: actualOsmanthus,
    actual_qty_red_date: actualRed,
    actual_qty_rock_sugar: actualRock,
    linked_order_id: input.linked_order_id ?? null,
    order_code: orderCode,
    notes: input.notes?.trim() || null,
    status,
    bird_nest_osmanthus: input.bird_nest_osmanthus ?? 'large',
    bird_nest_red_date: input.bird_nest_red_date ?? 'large',
    bird_nest_rock_sugar: input.bird_nest_rock_sugar ?? 'large',
    lines_json: null,
  };

  const id = await insertPrepOrderRow(userId, insertRow);
  if (opts?.refetch === false) {
    return prepOrderFromInsert(userId, id, insertRow);
  }
  return (await getPrepOrder(id))!;
}

export interface PrepCapacityLine {
  capacity: PrepCapacity;
  qty_osmanthus?: number;
  qty_red_date?: number;
  qty_rock_sugar?: number;
}

export async function createPrepOrdersBatch(
  userId: number,
  input: {
    stewing_date: string;
    schedule_slot?: PrepScheduleSlot | null;
    order_type: PrepOrderType;
    linked_order_id?: number | null;
    order_code?: string;
    notes?: string | null;
    status?: PrepStatus;
    lines: PrepCapacityLine[];
  },
  opts?: { stewFormulas?: StewFormulas },
): Promise<PrepOrder[]> {
  const stew = opts?.stewFormulas ?? (await readKitchenStewFormulas(userId)).stewFormulas;
  const defaultStatus =
    input.status ??
    defaultPrepStatusForCreate(input.order_type, input.stewing_date, {
      hasProductionDate: true,
    });

  const drafted = planPrepCapacityLines(input.lines, { formulas: stew });
  if (!drafted.ok) throw new Error(drafted.error);

  return await db.transaction(async () => {
    const orderCode = planPrepBatchOrderCode(input.order_code, await nextOrderCode(userId));
    const planned = planPrepCapacityLines(input.lines, { formulas: stew });
    if (!planned.ok) throw new Error(planned.error);
    const { parent, linesJson } = planned.plan;

    const insertRow: InsertPrepInput = {
      stewing_date: input.stewing_date,
      schedule_slot: input.schedule_slot ?? null,
      order_type: input.order_type,
      capacity: parent.capacity,
      qty_osmanthus: parent.qty_osmanthus,
      qty_red_date: parent.qty_red_date,
      qty_rock_sugar: parent.qty_rock_sugar,
      actual_qty_osmanthus: parent.actual_qty_osmanthus,
      actual_qty_red_date: parent.actual_qty_red_date,
      actual_qty_rock_sugar: parent.actual_qty_rock_sugar,
      linked_order_id: input.linked_order_id ?? null,
      order_code: orderCode,
      notes: input.notes?.trim() || null,
      status: defaultStatus,
      bird_nest_osmanthus: parent.bird_nest_osmanthus,
      bird_nest_red_date: parent.bird_nest_red_date,
      bird_nest_rock_sugar: parent.bird_nest_rock_sugar,
      lines_json: linesJson,
    };
    const id = await insertPrepOrderRow(userId, insertRow);
    return [prepOrderFromInsert(userId, id, insertRow)];
  });
}

/** Status workflow only (完成備料 / 開始炖製) — one SELECT + one UPDATE. */
export async function advancePrepOrderStatus(
  id: number | string,
  nextStatus: PrepStatus,
  existingRow?: PrepOrder | null,
): Promise<PrepOrder | null> {
  const existing = existingRow ?? (await getPrepOrder(id));
  if (!existing) return null;

  const stewingStartedAt = nextStewingStartedAt(existing, nextStatus);

  await db
    .prepare(
      `UPDATE kitchen_prep_orders
       SET status = ?, stewing_started_at = ?, updated_at = datetime('now')
       WHERE id = ?`,
    )
    .run(nextStatus, stewingStartedAt, id);

  return {
    ...existing,
    status: nextStatus,
    stewing_started_at: stewingStartedAt,
  };
}

export async function bulkSetPrepOrderStatus(
  ids: number[],
  nextStatus: PrepStatus,
): Promise<{ updated: PrepOrder[]; not_found: number[]; skipped: number[] }> {
  if (nextStatus === 'completed') {
    throw new Error('Bulk status cannot set completed — use the completion modal per order');
  }
  const uniqueIds = Array.from(
    new Set(ids.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)),
  );
  const updated: PrepOrder[] = [];
  const not_found: number[] = [];
  const skipped: number[] = [];

  const byId = await getPrepOrdersByIds(uniqueIds);
  const toUpdate: PrepOrder[] = [];

  for (const id of uniqueIds) {
    const existing = byId.get(id);
    if (!existing) {
      not_found.push(id);
      continue;
    }
    if (existing.status === 'completed') {
      skipped.push(id);
      continue;
    }
    if (existing.status === nextStatus) {
      updated.push(existing);
      continue;
    }
    toUpdate.push(existing);
  }

  if (toUpdate.length > 0) {
    await db.transaction(async () => {
      for (const existing of toUpdate) {
        const stewingStartedAt = nextStewingStartedAt(existing, nextStatus);
        await db
          .prepare(
            `UPDATE kitchen_prep_orders
             SET status = ?, stewing_started_at = ?, updated_at = datetime('now')
             WHERE id = ?`,
          )
          .run(nextStatus, stewingStartedAt, existing.id);
        updated.push({
          ...existing,
          status: nextStatus,
          stewing_started_at: stewingStartedAt,
        });
      }
    });
  }

  return { updated, not_found, skipped };
}

const SESSION_GROUP_LIMIT = 100;

function uniquePrepIds(ids: number[]): number[] {
  return Array.from(
    new Set(ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)),
  );
}

/**
 * Mark every open order in a session as stewing with one shared start time.
 * Already-stewing rows are rewritten so the batch clock matches.
 */
export async function startPrepSession(
  ownerId: number,
  ids: number[],
): Promise<{ updated: PrepOrder[]; skipped: number[]; not_found: number[] }> {
  const uniqueIds = uniquePrepIds(ids);
  if (uniqueIds.length > SESSION_GROUP_LIMIT) {
    throw new Error(`Too many orders in one session (max ${SESSION_GROUP_LIMIT})`);
  }
  const byId = await getPrepOrdersByIds(uniqueIds);
  const startedAt = hkNowDateTime();
  const updated: PrepOrder[] = [];
  const skipped: number[] = [];
  const not_found: number[] = [];
  const toUpdate: PrepOrder[] = [];

  for (const id of uniqueIds) {
    const existing = byId.get(id);
    if (!existing || existing.user_id !== ownerId) {
      not_found.push(id);
      continue;
    }
    if (existing.status === 'completed') {
      skipped.push(id);
      continue;
    }
    toUpdate.push(existing);
  }

  if (toUpdate.length > 0) {
    await db.transaction(async () => {
      for (const existing of toUpdate) {
        await db
          .prepare(
            `UPDATE kitchen_prep_orders
             SET status = 'stewing', stewing_started_at = ?, updated_at = datetime('now')
             WHERE id = ?`,
          )
          .run(startedAt, existing.id);
        updated.push({
          ...existing,
          status: 'stewing',
          stewing_started_at: startedAt,
        });
      }
    });
  }

  return { updated, skipped, not_found };
}

/**
 * Complete every open order in a session at the expected yield, one completion time.
 * Refuses before any write when an open order is not already stewing.
 */
export async function completePrepSession(
  ownerId: number,
  actorUserId: number,
  operatorName: string,
  ids: number[],
): Promise<{ updated: PrepOrder[]; skipped: number[]; not_found: number[]; error?: string }> {
  const uniqueIds = uniquePrepIds(ids);
  if (uniqueIds.length > SESSION_GROUP_LIMIT) {
    throw new Error(`Too many orders in one session (max ${SESSION_GROUP_LIMIT})`);
  }
  const byId = await getPrepOrdersByIds(uniqueIds);
  const skipped: number[] = [];
  const not_found: number[] = [];
  const open: PrepOrder[] = [];

  for (const id of uniqueIds) {
    const existing = byId.get(id);
    if (!existing || existing.user_id !== ownerId) {
      not_found.push(id);
      continue;
    }
    if (existing.status === 'completed') {
      skipped.push(id);
      continue;
    }
    open.push(existing);
  }

  if (open.some((order) => order.status !== 'stewing')) {
    throw new Error('Start stewing for this session before marking it complete');
  }

  const completedAt = hkNowDateTime();
  const updated: PrepOrder[] = [];
  let error: string | undefined;
  for (const existing of open) {
    try {
      const result = await completePrepProduction(
        existing.id,
        actorUserId,
        operatorName,
        {
          actual_yield: 0,
          completion_remarks: 'Session group 時段完成',
        },
        { existing, matchExpected: true, completedAt },
      );
      if (result) updated.push(result.order);
      else skipped.push(existing.id);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to complete session';
      break;
    }
  }

  return { updated, skipped, not_found, ...(error ? { error } : {}) };
}

export async function updatePrepOrder(
  id: number | string,
  input: Partial<{
    stewing_date: string;
    schedule_slot: PrepScheduleSlot | null;
    order_type: PrepOrderType;
    capacity: PrepCapacity;
    status: PrepStatus;
    qty_osmanthus: number;
    qty_red_date: number;
    qty_rock_sugar: number;
    actual_qty_osmanthus?: number | null;
    actual_qty_red_date?: number | null;
    actual_qty_rock_sugar?: number | null;
    bird_nest_osmanthus?: BirdNestType;
    bird_nest_red_date?: BirdNestType;
    bird_nest_rock_sugar?: BirdNestType;
    notes: string | null;
    allowEmptyQtys: boolean;
    lines: PrepCapacityLineDraft[];
  }>,
  opts?: {
    existing?: PrepOrder;
    stewFormulas?: StewFormulas;
    skipRefetch?: boolean;
  },
): Promise<PrepOrder | null> {
  const existing = opts?.existing ?? (await getPrepOrder(id));
  if (!existing) return null;

  const stew =
    opts?.stewFormulas ??
    (await readKitchenStewFormulas(await resolveKitchenOwnerUserId())).stewFormulas;

  const hasLinesPayload = Array.isArray(input.lines);
  const keepMultiLines = !hasLinesPayload && prepOrderLines(existing).length > 1;

  let capacity = input.capacity ?? existing.capacity;
  let qtyOsmanthus = Math.max(0, input.qty_osmanthus ?? existing.qty_osmanthus);
  let qtyRed = isRedDateAllowed(capacity, stew)
    ? Math.max(0, input.qty_red_date ?? existing.qty_red_date)
    : 0;
  let qtyRock = Math.max(0, input.qty_rock_sugar ?? existing.qty_rock_sugar);
  let actualOsmanthus = nextActualQty(
    existing.qty_osmanthus,
    existing.actual_qty_osmanthus,
    qtyOsmanthus,
    input.actual_qty_osmanthus
  );
  let actualRed = isRedDateAllowed(capacity, stew)
    ? nextActualQty(
        existing.qty_red_date,
        existing.actual_qty_red_date,
        qtyRed,
        input.actual_qty_red_date
      )
    : 0;
  let actualRock = nextActualQty(
    existing.qty_rock_sugar,
    existing.actual_qty_rock_sugar,
    qtyRock,
    input.actual_qty_rock_sugar
  );
  let birdOsmanthus = input.bird_nest_osmanthus ?? existing.bird_nest_osmanthus;
  let birdRed = input.bird_nest_red_date ?? existing.bird_nest_red_date;
  let birdRock = input.bird_nest_rock_sugar ?? existing.bird_nest_rock_sugar;
  let linesForOrder = prepOrderLines(existing);
  let linesJson: string | null = null;

  if (hasLinesPayload) {
    const planned = planPrepCapacityLines(input.lines || [], {
      formulas: stew,
      allowEmpty: Boolean(input.allowEmptyQtys),
    });
    if (!planned.ok) throw new Error(planned.error);
    const previous = prepOrderLines(existing);
    const filled = planned.plan.lines.map((line) => {
      const match = previous.find((row) => row.capacity === line.capacity);
      return {
        ...line,
        bird_nest_osmanthus: line.bird_nest_osmanthus ?? match?.bird_nest_osmanthus ?? existing.bird_nest_osmanthus,
        bird_nest_red_date: line.bird_nest_red_date ?? match?.bird_nest_red_date ?? existing.bird_nest_red_date,
        bird_nest_rock_sugar: line.bird_nest_rock_sugar ?? match?.bird_nest_rock_sugar ?? existing.bird_nest_rock_sugar,
      };
    });
    const parent = filled.length > 1 || filled.length === 1
      ? {
          capacity: filled[0].capacity,
          qty_osmanthus: filled[0].qty_osmanthus,
          qty_red_date: filled[0].qty_red_date,
          qty_rock_sugar: filled[0].qty_rock_sugar,
          actual_qty_osmanthus: filled[0].actual_qty_osmanthus ?? filled[0].qty_osmanthus,
          actual_qty_red_date: filled[0].actual_qty_red_date ?? filled[0].qty_red_date,
          actual_qty_rock_sugar: filled[0].actual_qty_rock_sugar ?? filled[0].qty_rock_sugar,
          bird_nest_osmanthus: filled[0].bird_nest_osmanthus ?? 'large',
          bird_nest_red_date: filled[0].bird_nest_red_date ?? 'large',
          bird_nest_rock_sugar: filled[0].bird_nest_rock_sugar ?? 'large',
        }
      : planned.plan.parent;
    capacity = parent.capacity;
    qtyOsmanthus = parent.qty_osmanthus;
    qtyRed = parent.qty_red_date;
    qtyRock = parent.qty_rock_sugar;
    actualOsmanthus = parent.actual_qty_osmanthus;
    actualRed = parent.actual_qty_red_date;
    actualRock = parent.actual_qty_rock_sugar;
    birdOsmanthus = parent.bird_nest_osmanthus;
    birdRed = parent.bird_nest_red_date;
    birdRock = parent.bird_nest_rock_sugar;
    linesForOrder = filled;
    linesJson = filled.length > 1 ? JSON.stringify(filled) : null;
  } else if (keepMultiLines) {
    capacity = existing.capacity;
    qtyOsmanthus = existing.qty_osmanthus;
    qtyRed = existing.qty_red_date;
    qtyRock = existing.qty_rock_sugar;
    actualOsmanthus = existing.actual_qty_osmanthus ?? existing.qty_osmanthus;
    actualRed = existing.actual_qty_red_date ?? existing.qty_red_date;
    actualRock = existing.actual_qty_rock_sugar ?? existing.qty_rock_sugar;
    birdOsmanthus = existing.bird_nest_osmanthus;
    birdRed = existing.bird_nest_red_date;
    birdRock = existing.bird_nest_rock_sugar;
    linesForOrder = prepOrderLines(existing);
    linesJson = JSON.stringify(linesForOrder);
  } else {
    const validationErr = validatePrepFlavorQtys(
      capacity,
      {
        osmanthus: qtyOsmanthus,
        red_date: qtyRed,
        rock_sugar: qtyRock,
      },
      { allowEmpty: Boolean(input.allowEmptyQtys), formulas: stew }
    );
    if (validationErr) throw new Error(validationErr);
    linesForOrder = prepOrderLines({
      capacity,
      qty_osmanthus: qtyOsmanthus,
      qty_red_date: qtyRed,
      qty_rock_sugar: qtyRock,
      actual_qty_osmanthus: actualOsmanthus,
      actual_qty_red_date: actualRed,
      actual_qty_rock_sugar: actualRock,
      bird_nest_osmanthus: birdOsmanthus,
      bird_nest_red_date: birdRed,
      bird_nest_rock_sugar: birdRock,
    });
    linesJson = null;
  }

  const nextStatus = input.status ?? existing.status;
  let stewingStartedAt = existing.stewing_started_at;
  if (nextStatus === 'stewing' && existing.status !== 'stewing') {
    stewingStartedAt = hkNowDateTime();
  } else if (nextStatus !== 'stewing' && nextStatus !== 'completed') {
    stewingStartedAt = null;
  }

  const stewingDate = input.stewing_date ?? existing.stewing_date;
  const scheduleSlot =
    input.schedule_slot !== undefined ? input.schedule_slot : (existing.schedule_slot ?? null);
  const orderType = input.order_type ?? existing.order_type;
  const notes = input.notes !== undefined ? input.notes : existing.notes;

  await db
    .prepare(
      `UPDATE kitchen_prep_orders SET
       stewing_date = ?, schedule_slot = ?, order_type = ?, capacity = ?, status = ?,
       qty_osmanthus = ?, qty_red_date = ?, qty_rock_sugar = ?,
       actual_qty_osmanthus = ?, actual_qty_red_date = ?, actual_qty_rock_sugar = ?,
       bird_nest_osmanthus = ?, bird_nest_red_date = ?, bird_nest_rock_sugar = ?,
       lines_json = ?, notes = ?, stewing_started_at = ?,
       updated_at = datetime('now')
     WHERE id = ?`
    )
    .run(
      stewingDate,
      scheduleSlot,
      orderType,
      capacity,
      nextStatus,
      qtyOsmanthus,
      qtyRed,
      qtyRock,
      actualOsmanthus,
      actualRed,
      actualRock,
      birdOsmanthus,
      birdRed,
      birdRock,
      linesJson,
      notes,
      stewingStartedAt,
      id
    );

  if (opts?.skipRefetch) {
    return {
      ...existing,
      stewing_date: stewingDate,
      schedule_slot: scheduleSlot,
      order_type: orderType,
      capacity,
      status: nextStatus,
      qty_osmanthus: qtyOsmanthus,
      qty_red_date: qtyRed,
      qty_rock_sugar: qtyRock,
      actual_qty_osmanthus: actualOsmanthus,
      actual_qty_red_date: actualRed,
      actual_qty_rock_sugar: actualRock,
      bird_nest_osmanthus: birdOsmanthus,
      bird_nest_red_date: birdRed,
      bird_nest_rock_sugar: birdRock,
      lines: linesForOrder,
      notes,
      stewing_started_at: stewingStartedAt,
    };
  }
  return await getPrepOrder(id);
}

export async function deletePrepOrder(id: number | string): Promise<boolean> {
  const existing = await getPrepOrder(id);
  if (!existing) return false;
  return await trashKitchenPrep(existing.user_id, Number(id));
}

export async function completePrepProduction(
  id: number | string,
  actorUserId: number,
  operatorName: string,
  input: {
    actual_yield: number;
    completion_remarks?: string | null;
    splits?: PrepCompletionSplit[];
  },
  opts?: { existing?: PrepOrder; matchExpected?: boolean; completedAt?: string },
): Promise<{ order: PrepOrder; calculation: PrepCalculation } | null> {
  const existing = opts?.existing ?? (await getPrepOrder(id));
  if (!existing) return null;
  if (existing.status === 'completed') return null;

  const kitchenOwnerId = await resolveKitchenOwnerUserId();
  const formulas = await readKitchenStewFormulas(kitchenOwnerId);
  const stew = formulas.stewFormulas;

  const calculation = computePrepCalculationForOrder(existing, stew);
  const expectedYield = calculation.totals.bottles;
  const remarks = input.completion_remarks?.trim() || null;
  const splits = opts?.matchExpected
    ? defaultCompletionSplits(calculation, existing.capacity)
    : normalizeCompletionSplits(input.splits, existing);
  const actualYield = opts?.matchExpected
    ? splits.reduce((sum, split) => sum + Math.max(0, Math.round(split.qty)), 0)
    : Math.max(0, Math.round(input.actual_yield));

  if (splits.length > 0) {
    const splitSum = splits.reduce((sum, s) => sum + s.qty, 0);
    if (splitSum !== actualYield) {
      throw new Error(`Split quantities must sum to actual yield (${actualYield} 樽)`);
    }
  }

  const flavoredSplits = splits.filter(
    (s): s is PrepCompletionSplit & { flavor: PrepFlavor } => Boolean(s.flavor) && s.qty > 0
  );
  const orderLines = prepOrderLines(existing);
  const finishedDeltas = flavoredSplits.map((s) => ({
    sku: finishedSku(s.capacity || existing.capacity, s.flavor),
    qty: s.qty,
  }));

  // Same capacity + flavor can appear once; merge so stock math stays exact.
  const merged = new Map<string, number>();
  for (const d of finishedDeltas) {
    merged.set(d.sku, (merged.get(d.sku) || 0) + d.qty);
  }
  const stockLines = Array.from(merged.entries()).map(([sku, qty]) => ({ sku, qty }));

  const splitsByCapacity = new Map<string, Array<{ flavor: PrepFlavor; qty: number }>>();
  for (const split of flavoredSplits) {
    const capacity = split.capacity || existing.capacity;
    const group = splitsByCapacity.get(capacity) || [];
    group.push({ flavor: split.flavor, qty: split.qty });
    splitsByCapacity.set(capacity, group);
  }
  const rawGroups = Array.from(splitsByCapacity.entries()).map(([capacity, group]) => {
    const line = orderLines.find((row) => row.capacity === capacity);
    return computeStewingRawNeeds(
      capacity,
      group,
      stew,
      prepOrderBirdNestSelections({
        bird_nest_osmanthus: line?.bird_nest_osmanthus ?? existing.bird_nest_osmanthus,
        bird_nest_red_date: line?.bird_nest_red_date ?? existing.bird_nest_red_date,
        bird_nest_rock_sugar: line?.bird_nest_rock_sugar ?? existing.bird_nest_rock_sugar,
      })
    );
  });
  const rawConsume = sumRawNeedLines(rawGroups);

  const splitsJson = splits.length > 0 ? JSON.stringify(splits) : null;

  if (stockLines.length > 0 || rawConsume.length > 0) {
    const stockResult = await addFinishedFromStewing(kitchenOwnerId, actorUserId, {
      finishedDeltas: stockLines,
      rawConsume,
      prepOrderId: existing.id,
      prepOrderCode: existing.order_code,
      remarks,
    });
    if (stockResult.error) throw new Error(stockResult.error);
  }

  const completedAt = opts?.completedAt?.trim() || hkNowDateTime();
  await db
    .prepare(
      `UPDATE kitchen_prep_orders SET
       status = 'completed',
       expected_yield = ?,
       actual_yield = ?,
       completion_remarks = ?,
       completion_splits_json = ?,
       completed_at = ?,
       completed_by = ?,
       updated_at = datetime('now')
     WHERE id = ?`
    )
    .run(expectedYield, actualYield, remarks, splitsJson, completedAt, operatorName, id);

  const activityBody = buildKitchenCompletionActivityBody(
    existing.order_code,
    expectedYield,
    actualYield,
    remarks,
    splits
  );

  if (existing.linked_order_id) {
    await logActivity(
      'order',
      existing.linked_order_id,
      existing.user_id,
      'activity',
      operatorName,
      activityBody
    );
  }

  const order: PrepOrder = {
    ...existing,
    status: 'completed',
    expected_yield: expectedYield,
    actual_yield: actualYield,
    completion_remarks: remarks,
    completion_splits: splits.length > 0 ? splits : null,
    completed_at: completedAt,
    completed_by: operatorName,
  };
  return { order, calculation };
}

/** Find prep linked to an order (company-wide). */
export async function getPrepByLinkedOrderId(
  _ownerId: number,
  orderId: number
): Promise<PrepOrder | null> {
  const row = (await db
    .prepare(
      `SELECT * FROM kitchen_prep_orders
       WHERE linked_order_id = ?
       ORDER BY id ASC LIMIT 1`
    )
    .get(orderId)) as PrepRow | undefined;
  return row ? hydrate(row) : null;
}

/** True when ensurePrepFromWeddingOrder would not change the linked prep row. */
function weddingPrepSyncUnchanged(
  existing: PrepOrder,
  fields: Record<string, string>,
  stewingDate: string,
  capacity: PrepCapacity,
  qtyOsmanthus: number,
  qtyRedDate: number,
  qtyRockSugar: number,
  actualOsmanthus: number,
  actualRedDate: number,
  actualRockSugar: number,
  statusUpdate: PrepStatus,
): boolean {
  if (existing.stewing_date !== stewingDate) return false;
  if (existing.capacity !== capacity) return false;
  if (existing.qty_osmanthus !== qtyOsmanthus) return false;
  if (existing.qty_red_date !== qtyRedDate) return false;
  if (existing.qty_rock_sugar !== qtyRockSugar) return false;
  if (existing.status !== statusUpdate) return false;
  if ((fields.actual_qty_osmanthus || '').trim()) {
    if ((existing.actual_qty_osmanthus ?? 0) !== actualOsmanthus) return false;
  }
  if ((fields.actual_qty_red_date || '').trim()) {
    if ((existing.actual_qty_red_date ?? 0) !== actualRedDate) return false;
  }
  if ((fields.actual_qty_rock_sugar || '').trim()) {
    if ((existing.actual_qty_rock_sugar ?? 0) !== actualRockSugar) return false;
  }
  return true;
}

function parseOrderFields(fieldsJson: string | null | undefined): Record<string, string> {
  try {
    const raw = fieldsJson ? JSON.parse(fieldsJson) : {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw || {})) {
      if (v == null) continue;
      out[k] = typeof v === 'string' ? v : String(v);
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Create or sync a wedding kitchen-prep row for a 回禮 sales order.
 * Idempotent on linked_order_id. Does not alter completed preps.
 */
export async function ensurePrepFromWeddingOrder(
  ownerId: number,
  orderId: number
): Promise<PrepOrder | null> {
  const order = await db
    .prepare('SELECT id, po_number, status, fields_json FROM orders WHERE id = ? AND user_id = ?')
    .get(orderId, ownerId) as
    | { id: number; po_number: string | null; status: string | null; fields_json: string }
    | undefined;
  if (!order) return null;

  const fields = parseOrderFields(order.fields_json);
  if (!isWeddingGiftOrderType(fields.order_type || '')) return null;

  const existing = await getPrepByLinkedOrderId(ownerId, order.id);
  if (existing?.status === 'completed') return existing;

  const n = (k: string) => {
    const v = Number(fields[k]);
    return Number.isFinite(v) ? v : 0;
  };

  const productionDate =
    (fields.production_date || '').trim() ||
    ((fields.big_day || '').trim() ? addCalendarDays(fields.big_day.trim(), -10) : '');
  const stewingDate = productionDate || (fields.client_delivery_date || '').trim() || hkTodayIso();
  const capacity = mapWeddingCapacityToPrep(fields.bottle_capacity || '') ?? '45g';
  const qtyOsmanthus = n('qty_osmanthus');
  const qtyRedDate = n('qty_red_date');
  const qtyRockSugar = n('qty_rock_sugar');
  const actualFromField = (key: string, fallback: number) =>
    (fields[key] || '').trim() ? n(key) : fallback;
  const actualOsmanthus = actualFromField('actual_qty_osmanthus', qtyOsmanthus);
  const actualRedDate = actualFromField('actual_qty_red_date', qtyRedDate);
  const actualRockSugar = actualFromField('actual_qty_rock_sugar', qtyRockSugar);
  const nextStatus = weddingPrepStatusFromDate(stewingDate, {
    hasProductionDate: Boolean(productionDate),
  });
  const orderCode = order.po_number?.trim() || undefined;

  if (!existing) {
    const kitchenOwnerId = await resolveKitchenOwnerUserId();
    const created = await createPrepOrder(kitchenOwnerId, {
      stewing_date: stewingDate,
      order_type: 'wedding',
      capacity,
      qty_osmanthus: qtyOsmanthus,
      qty_red_date: qtyRedDate,
      qty_rock_sugar: qtyRockSugar,
      actual_qty_osmanthus: actualOsmanthus,
      actual_qty_red_date: actualRedDate,
      actual_qty_rock_sugar: actualRockSugar,
      linked_order_id: order.id,
      order_code: orderCode,
      notes: null,
      status: nextStatus,
      allowEmptyQtys: true,
    });
    await logActivity(
      'order',
      order.id,
      ownerId,
      'activity',
      'System',
      `[System] Kitchen prep ${created.order_code} linked — stewing ${stewingDate} (${nextStatus})`
    );
    return created;
  }

  const prevStewing = existing.stewing_date;
  const statusUpdate =
    existing.status === 'not_started' || existing.status === 'scheduled'
      ? nextStatus
      : existing.status;

  if (
    weddingPrepSyncUnchanged(
      existing,
      fields,
      stewingDate,
      capacity,
      qtyOsmanthus,
      qtyRedDate,
      qtyRockSugar,
      actualOsmanthus,
      actualRedDate,
      actualRockSugar,
      statusUpdate,
    )
  ) {
    return existing;
  }

  const updated = await updatePrepOrder(existing.id, {
    stewing_date: stewingDate,
    order_type: 'wedding',
    capacity,
    qty_osmanthus: qtyOsmanthus,
    qty_red_date: qtyRedDate,
    qty_rock_sugar: qtyRockSugar,
    actual_qty_osmanthus: (fields.actual_qty_osmanthus || '').trim() ? actualOsmanthus : undefined,
    actual_qty_red_date: (fields.actual_qty_red_date || '').trim() ? actualRedDate : undefined,
    actual_qty_rock_sugar: (fields.actual_qty_rock_sugar || '').trim() ? actualRockSugar : undefined,
    status: statusUpdate,
    allowEmptyQtys: true,
  });

  if (updated && (prevStewing !== stewingDate || existing.status !== statusUpdate)) {
    await logActivity(
      'order',
      order.id,
      ownerId,
      'activity',
      'System',
      `[System] Kitchen prep ${updated.order_code} synced — stewing ${stewingDate} (${statusUpdate})`
    );
  }

  return updated;
}

export async function runKitchenPrepAutoImport(userId: number | null): Promise<{
  processed: number;
  created: number;
  activated: number;
  skipped: number;
}> {
  const today = hkTodayIso();
  let created = 0;
  let activated = 0;
  let skipped = 0;

  // Activate due not-started preps.
  const inactiveRows = (await (userId == null
    ? db.prepare(
        `SELECT id, user_id, linked_order_id, stewing_date, order_code
         FROM kitchen_prep_orders
         WHERE status = 'not_started' AND stewing_date <= ?`
      ).all(today)
    : db.prepare(
        `SELECT id, user_id, linked_order_id, stewing_date, order_code
         FROM kitchen_prep_orders
         WHERE user_id = ? AND status = 'not_started' AND stewing_date <= ?`
      ).all(userId, today))) as {
    id: number;
    user_id: number;
    linked_order_id: number | null;
    stewing_date: string;
    order_code: string;
  }[];

  for (const row of inactiveRows) {
    await db
      .prepare(
        `UPDATE kitchen_prep_orders SET status = 'scheduled', updated_at = datetime('now')
         WHERE id = ? AND user_id = ? AND status = 'not_started'`
      )
      .run(row.id, row.user_id);
    activated += 1;
    if (row.linked_order_id) {
      await logActivity(
        'order',
        row.linked_order_id,
        row.user_id,
        'activity',
        'System',
        `[System] Kitchen prep ${row.order_code} activated (production date ${row.stewing_date})`
      );
    }
  }

  // Catch-up: open 回禮 orders missing a linked prep.
  const weddingType = '燕窩回禮燉製';
  const typePatterns = [`%"order_type":"${weddingType}"%`, `%"order_type": "${weddingType}"%`];
  const orderRows = (await (userId == null
    ? db
        .prepare(
          `SELECT id, user_id, status, fields_json FROM orders
           WHERE (${typePatterns.map(() => 'fields_json LIKE ?').join(' OR ')})`
        )
        .all(...typePatterns)
    : db
        .prepare(
          `SELECT id, user_id, status, fields_json FROM orders
           WHERE user_id = ?
             AND (${typePatterns.map(() => 'fields_json LIKE ?').join(' OR ')})`
        )
        .all(userId, ...typePatterns))) as {
    id: number;
    user_id: number;
    status: string | null;
    fields_json: string;
  }[];

  // Existing preps for these orders (one query).
  const orderIds = orderRows.map((o) => o.id);
  const existingPrepIds = new Set<number>();
  if (orderIds.length) {
    const ph = orderIds.map(() => '?').join(',');
    const existing = (await db
      .prepare(
        `SELECT linked_order_id FROM kitchen_prep_orders
         WHERE linked_order_id IN (${ph})`
      )
      .all(...orderIds)) as { linked_order_id: number }[];
    for (const r of existing) existingPrepIds.add(Number(r.linked_order_id));
  }

  let processed = inactiveRows.length;
  for (const o of orderRows) {
    const status = (o.status || '').trim();
    if (status === '已寄出 SENT' || /\bSENT\b/i.test(status)) continue;
    const fields = parseOrderFields(o.fields_json);
    if (!isWeddingGiftOrderType(fields.order_type || '')) continue;
    processed += 1;
    if (existingPrepIds.has(o.id)) {
      skipped += 1;
      continue;
    }
    const prep = await ensurePrepFromWeddingOrder(o.user_id, o.id);
    if (prep) {
      created += 1;
      existingPrepIds.add(o.id);
      await logActivity(
        'order',
        o.id,
        o.user_id,
        'activity',
        'System',
        `[System] Auto-created kitchen prep ${prep.order_code}`
      );
    } else {
      skipped += 1;
    }
  }

  return { processed, created, activated, skipped };
}

