import db from './db';
import {
  RAW_MATERIALS,
  RAW_MATERIAL_ALIASES,
  GIFT_BOX_TYPES,
  KITCHEN_ACTION_LABELS,
  roundRawQty,
  formatRawQty,
  type KitchenState,
  type KitchenOpenOrder,
  type KitchenNeedLine,
  type KitchenMovement,
  type KitchenAction,
} from './kitchen';
import {
  FINISHED_SKUS,
  expandGiftBoxBom,
  applyBomQtyOverrides,
  aggregateBomDemand,
  finishedSku,
  finishedSkuLabel,
  finishedShortfallsByCapacity,
  giftNeedKey,
  bottleNeedKey,
  reverseMovementDeltas,
  wouldGoNegative,
  type MovementDeltas,
  type StockMaps,
} from './kitchen-bom';
import {
  NESTIEE_ORDER_TYPE,
  WEDDING_GIFT_ORDER_TYPE,
  mapWeddingCapacityToPrep,
} from './orders';
import type { PrepFlavor } from './kitchen-prep';
import { aggregateRawNeedsFromPrepOrders, type PrepCapacity, type PrepOrderType, type PrepStatus } from './kitchen-prep';

// Re-export PrepFlavor mapping used for 回禮 bottles
const WEDDING_FLAVOR_KEYS: { prep: PrepFlavor; actualKey: string; clientKey: string }[] = [
  { prep: 'rock_sugar', actualKey: 'actual_qty_rock_sugar', clientKey: 'qty_rock_sugar' },
  { prep: 'osmanthus', actualKey: 'actual_qty_osmanthus', clientKey: 'qty_osmanthus' },
  { prep: 'red_date', actualKey: 'actual_qty_red_date', clientKey: 'qty_red_date' },
];

function fieldNum(fields: Record<string, unknown>, k: string): number {
  const v = fields[k];
  const num = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.floor(num));
}

function effectiveFlavorQty(fields: Record<string, unknown>, actualKey: string, clientKey: string): number {
  const raw = fields[actualKey];
  const hasActual = raw !== undefined && String(raw).trim() !== '';
  return hasActual ? fieldNum(fields, actualKey) : fieldNum(fields, clientKey);
}

function parseFields(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function orderTypeOf(fields: Record<string, unknown>): string {
  return typeof fields.order_type === 'string' ? fields.order_type : '';
}

export async function ensureSeed(userId: number) {
  const insF = db.prepare('INSERT OR IGNORE INTO kitchen_finished (user_id, sku, quantity) VALUES (?, ?, ?)');
  for (const sku of FINISHED_SKUS) {
    await insF.run(userId, sku, 0);
  }

  const insG = db.prepare('INSERT OR IGNORE INTO kitchen_gift_boxes (user_id, box_type, quantity) VALUES (?, ?, ?)');
  for (const g of GIFT_BOX_TYPES) {
    await insG.run(userId, g.id, 0);
  }

  const insR = db.prepare(
    'INSERT OR IGNORE INTO kitchen_raw (user_id, name, unit, total_stock, allocated_stock) VALUES (?, ?, ?, ?, 0)'
  );
  for (const m of RAW_MATERIALS) {
    await insR.run(userId, m.name, m.unit, m.seedStock);
  }

  // Fold legacy alias rows (頂級乾燕餅→燕餅, 燕窩冰糖→冰糖) into canonical stock.
  for (const [alias, canonical] of Object.entries(RAW_MATERIAL_ALIASES)) {
    const aliasRow = (await db
      .prepare('SELECT total_stock, allocated_stock FROM kitchen_raw WHERE user_id = ? AND name = ?')
      .get(userId, alias)) as { total_stock: number; allocated_stock: number } | undefined;
    if (!aliasRow) continue;
    const total = Number(aliasRow.total_stock) || 0;
    const alloc = Number(aliasRow.allocated_stock) || 0;
    if (total !== 0 || alloc !== 0) {
      const def = RAW_MATERIALS.find((m) => m.name === canonical);
      await ensureRawRow(userId, canonical, def?.unit || 'g');
      await db
        .prepare(
          'UPDATE kitchen_raw SET total_stock = total_stock + ?, allocated_stock = allocated_stock + ? WHERE user_id = ? AND name = ?'
        )
        .run(total, alloc, userId, canonical);
    }
    await db.prepare('DELETE FROM kitchen_raw WHERE user_id = ? AND name = ?').run(userId, alias);
  }
}

async function ensureFinishedRow(userId: number, sku: string) {
  await db.prepare('INSERT OR IGNORE INTO kitchen_finished (user_id, sku, quantity) VALUES (?, ?, 0)').run(userId, sku);
}

async function ensureGiftRow(userId: number, boxType: string) {
  await db.prepare('INSERT OR IGNORE INTO kitchen_gift_boxes (user_id, box_type, quantity) VALUES (?, ?, 0)').run(userId, boxType);
}

async function ensureRawRow(userId: number, name: string, unit = 'g') {
  await db
    .prepare('INSERT OR IGNORE INTO kitchen_raw (user_id, name, unit, total_stock, allocated_stock) VALUES (?, ?, ?, 0, 0)')
    .run(userId, name, unit);
}

async function loadStockMaps(userId: number): Promise<StockMaps> {
  const finishedRows = (await db
    .prepare('SELECT sku, quantity FROM kitchen_finished WHERE user_id = ?')
    .all(userId)) as { sku: string; quantity: number }[];
  const rawRows = (await db
    .prepare('SELECT name, total_stock FROM kitchen_raw WHERE user_id = ?')
    .all(userId)) as { name: string; total_stock: number }[];
  const giftRows = (await db
    .prepare('SELECT box_type, quantity FROM kitchen_gift_boxes WHERE user_id = ?')
    .all(userId)) as { box_type: string; quantity: number }[];

  const finished: Record<string, number> = {};
  for (const sku of FINISHED_SKUS) finished[sku] = 0;
  for (const r of finishedRows) {
    if (FINISHED_SKUS.includes(r.sku)) finished[r.sku] = Number(r.quantity) || 0;
  }

  const raw: Record<string, number> = {};
  for (const m of RAW_MATERIALS) raw[m.name] = 0;
  for (const r of rawRows) {
    const def = RAW_MATERIALS.find((m) => m.name === r.name);
    const unit = def?.unit || 'g';
    raw[r.name] = roundRawQty(Number(r.total_stock) || 0, unit);
  }

  const giftBoxes: Record<string, number> = {};
  for (const g of GIFT_BOX_TYPES) giftBoxes[g.id] = 0;
  for (const r of giftRows) giftBoxes[r.box_type] = Number(r.quantity) || 0;

  return { finished, raw, giftBoxes };
}

async function loadFulfillments(userId: number): Promise<Map<string, number>> {
  const rows = (await db
    .prepare('SELECT order_id, need_key, fulfilled_qty FROM kitchen_order_fulfillments WHERE user_id = ?')
    .all(userId)) as { order_id: number; need_key: string; fulfilled_qty: number }[];
  const map = new Map<string, number>();
  for (const r of rows) {
    map.set(`${r.order_id}::${r.need_key}`, Number(r.fulfilled_qty) || 0);
  }
  return map;
}

function fulfilledOf(map: Map<string, number>, orderId: number, needKey: string): number {
  return map.get(`${orderId}::${needKey}`) || 0;
}

interface OrderRow {
  id: number;
  po_number: string | null;
  name: string | null;
  fields_json: string | null;
  status?: string | null;
}

function nestieeNeeds(
  order: OrderRow,
  fields: Record<string, unknown>,
  fulfillments: Map<string, number>
): KitchenNeedLine[] {
  const needs: KitchenNeedLine[] = [];
  for (const g of GIFT_BOX_TYPES) {
    const required = fieldNum(fields, g.qtyKey);
    if (required <= 0) continue;
    const needKey = giftNeedKey(g.id);
    const fulfilled = Math.min(required, fulfilledOf(fulfillments, order.id, needKey));
    const remaining = Math.max(0, required - fulfilled);
    needs.push({
      needKey,
      label: `${g.label} ×${required}`,
      required,
      fulfilled,
      remaining,
      done: remaining === 0,
    });
  }
  return needs;
}

function returnGiftNeeds(
  order: OrderRow,
  fields: Record<string, unknown>,
  fulfillments: Map<string, number>
): KitchenNeedLine[] {
  const capacityRaw = typeof fields.bottle_capacity === 'string' ? fields.bottle_capacity : '';
  const prepCap = mapWeddingCapacityToPrep(capacityRaw);
  if (!prepCap) return [];
  const needs: KitchenNeedLine[] = [];
  for (const fk of WEDDING_FLAVOR_KEYS) {
    const required = effectiveFlavorQty(fields, fk.actualKey, fk.clientKey);
    if (required <= 0) continue;
    const sku = finishedSku(prepCap, fk.prep);
    const needKey = bottleNeedKey(sku);
    const fulfilled = Math.min(required, fulfilledOf(fulfillments, order.id, needKey));
    const remaining = Math.max(0, required - fulfilled);
    needs.push({
      needKey,
      label: `${finishedSkuLabel(sku)} ×${required}`,
      required,
      fulfilled,
      remaining,
      done: remaining === 0,
    });
  }
  return needs;
}

async function loadOpenOrders(userId: number, fulfillments: Map<string, number>): Promise<KitchenOpenOrder[]> {
  const rows = (await db
    .prepare('SELECT id, po_number, name, status, fields_json FROM orders WHERE user_id = ? ORDER BY id DESC')
    .all(userId)) as OrderRow[];

  const out: KitchenOpenOrder[] = [];
  for (const row of rows) {
    // Hide shipped orders from the kitchen list.
    const status = (row.status || '').trim();
    if (status === '已寄出 SENT' || /\bSENT\b/i.test(status)) continue;

    const fields = parseFields(row.fields_json);
    const ot = orderTypeOf(fields);
    let type: 'nestiee' | 'return_gift' | null = null;
    let typeLabel = '';
    let needs: KitchenNeedLine[] = [];

    if (ot === NESTIEE_ORDER_TYPE) {
      type = 'nestiee';
      typeLabel = 'Nestiee';
      needs = nestieeNeeds(row, fields, fulfillments);
    } else if (ot === WEDDING_GIFT_ORDER_TYPE) {
      type = 'return_gift';
      typeLabel = '回禮';
      needs = returnGiftNeeds(row, fields, fulfillments);
    } else {
      continue;
    }

    if (needs.length === 0) continue;
    const fullyFulfilled = needs.every((n) => n.done);

    out.push({
      id: row.id,
      poNumber: row.po_number?.trim() || String(row.id),
      type,
      typeLabel,
      needs,
      fullyFulfilled,
    });
  }

  // Pending first, then completed — so attention items stay on top.
  out.sort((a, b) => {
    if (a.fullyFulfilled !== b.fullyFulfilled) return a.fullyFulfilled ? 1 : -1;
    return b.id - a.id;
  });
  return out;
}

function computeDemand(openOrders: KitchenOpenOrder[]): KitchenState['demand'] {
  const giftBoxes: Record<string, number> = {};
  const finished: Record<string, number> = {};
  const raw: Record<string, number> = {};

  for (const o of openOrders) {
    for (const n of o.needs) {
      if (n.remaining <= 0) continue;
      if (n.needKey.startsWith('gift:')) {
        const boxType = n.needKey.slice(5);
        giftBoxes[boxType] = (giftBoxes[boxType] || 0) + n.remaining;
        const bom = expandGiftBoxBom(boxType, n.remaining);
        const agg = aggregateBomDemand(bom);
        for (const [sku, qty] of Object.entries(agg.finished)) {
          finished[sku] = (finished[sku] || 0) + qty;
        }
        // Raw needed is driven by unfinished kitchen prep orders (see getState).
      } else if (n.needKey.startsWith('bottle:')) {
        const sku = n.needKey.slice(7);
        finished[sku] = (finished[sku] || 0) + n.remaining;
      }
    }
  }
  return { giftBoxes, finished, raw };
}

async function loadUnfinishedPrepRawDemand(userId: number): Promise<Record<string, number>> {
  const rows = (await db
    .prepare(
      `SELECT capacity, order_type, status, qty_osmanthus, qty_red_date, qty_rock_sugar
       FROM kitchen_prep_orders
       WHERE user_id = ? AND status != 'completed'`
    )
    .all(userId)) as {
    capacity: PrepCapacity;
    order_type: PrepOrderType;
    status: PrepStatus;
    qty_osmanthus: number;
    qty_red_date: number;
    qty_rock_sugar: number;
  }[];
  return aggregateRawNeedsFromPrepOrders(rows);
}

async function loadMovements(userId: number): Promise<KitchenMovement[]> {
  const rows = (await db
    .prepare(
      `SELECT m.id, m.action, m.details_json, m.order_id, m.created_at, m.created_by,
              m.voided_at, m.voided_by, m.voids_movement_id,
              u.name AS created_by_name,
              v.name AS voided_by_name
       FROM kitchen_movements m
       JOIN users u ON u.id = m.created_by
       LEFT JOIN users v ON v.id = m.voided_by
       WHERE m.user_id = ?
         AND m.action != 'void'
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT 100`
    )
    .all(userId)) as {
    id: number;
    action: string;
    details_json: string;
    order_id: number | null;
    created_at: string;
    created_by: number;
    voided_at: string | null;
    voided_by: number | null;
    voids_movement_id: number | null;
    created_by_name: string;
    voided_by_name: string | null;
  }[];

  return rows.map((r) => {
    let summary = '';
    try {
      const d = JSON.parse(r.details_json || '{}') as { summary?: string };
      summary = d.summary || '';
    } catch {
      summary = '';
    }
    const action = r.action as KitchenAction;
    return {
      id: r.id,
      action,
      actionLabel: KITCHEN_ACTION_LABELS[action] || r.action,
      voidedActionLabel: null,
      summary,
      orderId: r.order_id,
      createdAt: r.created_at,
      createdBy: r.created_by,
      createdByName: r.created_by_name || '',
      voidedAt: r.voided_at,
      voidedBy: r.voided_by,
      voidedByName: r.voided_by_name,
      voidsMovementId: r.voids_movement_id,
    };
  });
}

export async function getState(userId: number, opts?: { isAdmin?: boolean }): Promise<KitchenState> {
  await ensureSeed(userId);
  const stock = await loadStockMaps(userId);
  const fulfillments = await loadFulfillments(userId);
  const openOrders = await loadOpenOrders(userId, fulfillments);
  const demand = computeDemand(openOrders);
  demand.raw = await loadUnfinishedPrepRawDemand(userId);
  const movements = await loadMovements(userId);

  const giftBoxes = GIFT_BOX_TYPES.map((g) => ({
    boxType: g.id,
    label: g.label,
    quantity: stock.giftBoxes[g.id] || 0,
    needed: demand.giftBoxes[g.id] || 0,
  }));

  const finished = FINISHED_SKUS.map((sku) => ({
    sku,
    label: finishedSkuLabel(sku),
    quantity: stock.finished[sku] || 0,
    needed: demand.finished[sku] || 0,
  }));

  const raw = RAW_MATERIALS.map((m) => ({
    name: m.name,
    unit: m.unit,
    quantity: roundRawQty(stock.raw[m.name] || 0, m.unit),
    needed: roundRawQty(demand.raw[m.name] || 0, m.unit),
  }));

  return {
    giftBoxes,
    finished,
    raw,
    demand,
    openOrders,
    movements,
    isAdmin: Boolean(opts?.isAdmin),
    holidayMode: await getHolidayMode(userId),
  };
}

async function getHolidayMode(userId: number): Promise<boolean> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO kitchen_settings (user_id, holiday_mode) VALUES (?, 0)`
    )
    .run(userId);
  const row = (await db
    .prepare('SELECT holiday_mode FROM kitchen_settings WHERE user_id = ?')
    .get(userId)) as { holiday_mode: number } | undefined;
  return Boolean(row?.holiday_mode);
}

export async function setHolidayMode(
  ownerId: number,
  isAdmin: boolean,
  holidayMode: boolean
): Promise<{ error?: string; state?: KitchenState }> {
  if (!isAdmin) return { error: 'Only admin can toggle holiday mode' };
  await db
    .prepare(
      `INSERT INTO kitchen_settings (user_id, holiday_mode, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET
         holiday_mode = excluded.holiday_mode,
         updated_at = datetime('now')`
    )
    .run(ownerId, holidayMode ? 1 : 0);
  return { state: await getState(ownerId, { isAdmin: true }) };
}

async function applyDeltas(userId: number, deltas: MovementDeltas) {
  for (const g of deltas.giftBoxDeltas) {
    await ensureGiftRow(userId, g.boxType);
    await db
      .prepare('UPDATE kitchen_gift_boxes SET quantity = quantity + ? WHERE user_id = ? AND box_type = ?')
      .run(g.delta, userId, g.boxType);
  }
  for (const f of deltas.finishedDeltas) {
    await ensureFinishedRow(userId, f.sku);
    await db
      .prepare('UPDATE kitchen_finished SET quantity = quantity + ? WHERE user_id = ? AND sku = ?')
      .run(f.delta, userId, f.sku);
  }
  for (const r of deltas.rawDeltas) {
    const def = RAW_MATERIALS.find((m) => m.name === r.name);
    const unit = def?.unit || 'g';
    await ensureRawRow(userId, r.name, unit);
    const cur = (await db
      .prepare('SELECT total_stock FROM kitchen_raw WHERE user_id = ? AND name = ?')
      .get(userId, r.name)) as { total_stock: number } | undefined;
    const next = roundRawQty((Number(cur?.total_stock) || 0) + r.delta, unit);
    await db
      .prepare('UPDATE kitchen_raw SET total_stock = ? WHERE user_id = ? AND name = ?')
      .run(next, userId, r.name);
  }
  for (const ful of deltas.fulfillments) {
    if (ful.qty === 0) continue;
    await db
      .prepare(
        `INSERT INTO kitchen_order_fulfillments (user_id, order_id, need_key, fulfilled_qty, updated_at)
         VALUES (?, ?, ?, GREATEST(0, ?), to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
         ON CONFLICT (user_id, order_id, need_key) DO UPDATE SET
           fulfilled_qty = GREATEST(0, kitchen_order_fulfillments.fulfilled_qty + ?),
           updated_at = to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')`
      )
      .run(userId, ful.orderId, ful.needKey, ful.qty, ful.qty);
  }
}

async function insertMovement(
  userId: number,
  actorId: number,
  action: KitchenAction,
  details: Record<string, unknown> & { summary: string; deltas: MovementDeltas },
  orderId: number | null
): Promise<number> {
  const res = await db
    .prepare(
      `INSERT INTO kitchen_movements (user_id, action, details_json, order_id, created_by)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(userId, action, JSON.stringify(details), orderId, actorId);
  return Number(res.lastInsertRowid);
}

function giftBoxLabel(boxType: string): string {
  return GIFT_BOX_TYPES.find((g) => g.id === boxType)?.label || boxType;
}

export async function makeGiftBox(
  ownerId: number,
  actorId: number,
  input: { boxType: string; quantity: number; consumeOverrides?: Record<string, number> }
): Promise<{
  error?: string;
  state?: KitchenState;
  finished_shortfalls?: { capacity: string; qtys: { osmanthus: number; red_date: number; rock_sugar: number } }[];
}> {
  await ensureSeed(ownerId);
  const boxType = input.boxType;
  if (!GIFT_BOX_TYPES.some((g) => g.id === boxType)) {
    return { error: 'Invalid gift box type' };
  }
  const qty = Math.max(1, Math.floor(Number(input.quantity) || 0));
  if (!qty) return { error: 'Quantity must be at least 1' };

  const defaults = expandGiftBoxBom(boxType, qty);
  const resolved = applyBomQtyOverrides(defaults, input.consumeOverrides);
  if (resolved.error) return { error: resolved.error };
  const lines = resolved.lines;
  const stock = await loadStockMaps(ownerId);

  const finishedShort: string[] = [];
  const rawShort: string[] = [];
  for (const line of lines) {
    if (line.kind === 'finished') {
      if ((stock.finished[line.sku] || 0) < line.qty) {
        finishedShort.push(
          `成品不足：${finishedSkuLabel(line.sku)}（需要 ${line.qty}，現有 ${stock.finished[line.sku] || 0}）`
        );
      }
    } else if ((stock.raw[line.name] || 0) < line.qty) {
      rawShort.push(`原料不足：${line.name}（需要 ${line.qty}，現有 ${stock.raw[line.name] || 0}）`);
    }
  }

  if (finishedShort.length || rawShort.length) {
    const finished_shortfalls = finishedShort.length
      ? finishedShortfallsByCapacity(lines, stock.finished)
      : [];
    const error = [...finishedShort, ...rawShort].join('；');
    return { error, finished_shortfalls };
  }

  // Packaging only: bottles/raw → gift box stock (orders allocate from gift boxes separately).
  const deltas: MovementDeltas = {
    giftBoxDeltas: [{ boxType, delta: qty }],
    finishedDeltas: lines
      .filter((l): l is { kind: 'finished'; sku: string; qty: number } => l.kind === 'finished')
      .map((l) => ({ sku: l.sku, delta: -l.qty })),
    rawDeltas: lines
      .filter((l): l is { kind: 'raw'; name: string; qty: number } => l.kind === 'raw')
      .map((l) => ({ name: l.name, delta: -l.qty })),
    fulfillments: [],
  };

  const summaryParts = [`+${qty} ${giftBoxLabel(boxType)}`];
  for (const l of lines) {
    summaryParts.push(l.kind === 'finished' ? `−${l.qty} ${finishedSkuLabel(l.sku)}` : `−${l.qty} ${l.name}`);
  }

  await db.transaction(async () => {
    await applyDeltas(ownerId, deltas);
    await insertMovement(
      ownerId,
      actorId,
      'make_gift_box',
      { summary: summaryParts.join('\n'), deltas, boxType, quantity: qty },
      null
    );
  });

  return { state: await getState(ownerId) };
}

/** Allocate already-packaged gift boxes to a Nestiee order (does not touch unfinished bottles). */
export async function allocateGiftBox(
  ownerId: number,
  actorId: number,
  input: { boxType: string; quantity: number; orderId: number }
): Promise<{ error?: string; state?: KitchenState }> {
  await ensureSeed(ownerId);
  const boxType = input.boxType;
  if (!GIFT_BOX_TYPES.some((g) => g.id === boxType)) {
    return { error: 'Invalid gift box type' };
  }
  const qty = Math.max(1, Math.floor(Number(input.quantity) || 0));
  if (!qty) return { error: 'Quantity must be at least 1' };

  const orderId = Number(input.orderId);
  if (!orderId) return { error: 'orderId required' };

  const order = (await db
    .prepare('SELECT id, po_number, fields_json FROM orders WHERE id = ? AND user_id = ?')
    .get(orderId, ownerId)) as OrderRow | undefined;
  if (!order) return { error: 'Order not found' };

  const fields = parseFields(order.fields_json);
  if (orderTypeOf(fields) !== NESTIEE_ORDER_TYPE) {
    return { error: 'Order is not a Nestiee order' };
  }

  const fulfillments = await loadFulfillments(ownerId);
  const needs = nestieeNeeds(order, fields, fulfillments);
  const needKey = giftNeedKey(boxType);
  const line = needs.find((n) => n.needKey === needKey);
  if (!line || line.remaining <= 0) return { error: '此禮盒類型無需再分配' };
  if (qty > line.remaining) {
    return { error: `超過剩餘需要（最多 ${line.remaining}）` };
  }

  const stock = await loadStockMaps(ownerId);
  if ((stock.giftBoxes[boxType] || 0) < qty) {
    return {
      error: `禮盒庫存不足：${giftBoxLabel(boxType)}（需要 ${qty}，現有 ${stock.giftBoxes[boxType] || 0}）`,
    };
  }

  const deltas: MovementDeltas = {
    giftBoxDeltas: [{ boxType, delta: -qty }],
    finishedDeltas: [],
    rawDeltas: [],
    fulfillments: [{ orderId, needKey, qty }],
  };

  const summary = [
    `PO# ${order.po_number || orderId}`,
    `−${giftBoxLabel(boxType)} ${qty}`,
  ].join('\n');

  await db.transaction(async () => {
    await applyDeltas(ownerId, deltas);
    await insertMovement(
      ownerId,
      actorId,
      'allocate_gift_box',
      { summary, deltas, boxType, quantity: qty },
      orderId
    );
  });

  return { state: await getState(ownerId) };
}

export async function makeReturnGift(
  ownerId: number,
  actorId: number,
  input: { orderId: number; lines?: { needKey: string; qty: number }[] }
): Promise<{ error?: string; state?: KitchenState }> {
  await ensureSeed(ownerId);
  const orderId = Number(input.orderId);
  const row = (await db
    .prepare('SELECT id, po_number, fields_json FROM orders WHERE id = ? AND user_id = ?')
    .get(orderId, ownerId)) as OrderRow | undefined;
  if (!row) return { error: 'Order not found' };

  const fields = parseFields(row.fields_json);
  if (orderTypeOf(fields) !== WEDDING_GIFT_ORDER_TYPE) {
    return { error: 'Order is not a 回禮 order' };
  }

  const fulfillments = await loadFulfillments(ownerId);
  const needs = returnGiftNeeds(row, fields, fulfillments).filter((n) => n.remaining > 0);
  if (needs.length === 0) return { error: 'No remaining bottles to fulfill' };

  const needByKey = new Map(needs.map((n) => [n.needKey, n]));
  const requested =
    Array.isArray(input.lines) && input.lines.length > 0
      ? input.lines
      : needs.map((n) => ({ needKey: n.needKey, qty: n.remaining }));

  const stock = await loadStockMaps(ownerId);
  const finishedDeltas: MovementDeltas['finishedDeltas'] = [];
  const fulRows: MovementDeltas['fulfillments'] = [];

  for (const line of requested) {
    const qty = Math.floor(Number(line.qty) || 0);
    if (qty <= 0) continue;
    const n = needByKey.get(line.needKey);
    if (!n) return { error: `Unknown need line: ${line.needKey}` };
    if (qty > n.remaining) {
      return { error: `${finishedSkuLabel(n.needKey.slice(7))} 超過剩餘需要（最多 ${n.remaining}）` };
    }
    const sku = n.needKey.slice(7);
    if ((stock.finished[sku] || 0) < qty) {
      return {
        error: `成品不足：${finishedSkuLabel(sku)}（需要 ${qty}，現有 ${stock.finished[sku] || 0}）`,
      };
    }
    finishedDeltas.push({ sku, delta: -qty });
    fulRows.push({ orderId, needKey: n.needKey, qty });
    stock.finished[sku] = (stock.finished[sku] || 0) - qty;
  }

  if (fulRows.length === 0) return { error: '請至少製作 1 樽' };

  const cleanSummary = [
    `PO# ${row.po_number || orderId}`,
    ...fulRows.map((f) => `−${finishedSkuLabel(f.needKey.slice(7))} ${f.qty}`),
  ];

  const deltas: MovementDeltas = {
    giftBoxDeltas: [],
    finishedDeltas,
    rawDeltas: [],
    fulfillments: fulRows,
  };

  await db.transaction(async () => {
    await applyDeltas(ownerId, deltas);
    await insertMovement(
      ownerId,
      actorId,
      'make_return_gift',
      { summary: cleanSummary.join('\n'), deltas },
      orderId
    );
  });

  return { state: await getState(ownerId) };
}

export async function restockRaw(
  ownerId: number,
  actorId: number,
  input: {
    deltas: { name: string; qty: number }[];
  }
): Promise<{ error?: string; state?: KitchenState }> {
  await ensureSeed(ownerId);
  const allowedRaw = new Set(RAW_MATERIALS.map((m) => m.name));
  const rawDeltas: MovementDeltas['rawDeltas'] = [];
  const summaryParts: string[] = [];

  for (const d of input.deltas || []) {
    if (!allowedRaw.has(d.name)) return { error: `Unknown raw material: ${d.name}` };
    const qty = Number(d.qty);
    if (!Number.isFinite(qty) || qty === 0) continue;
    const unit = RAW_MATERIALS.find((m) => m.name === d.name)?.unit || 'g';
    const rounded = roundRawQty(qty, unit);
    if (rounded === 0) continue;
    rawDeltas.push({ name: d.name, delta: rounded });
    summaryParts.push(`${rounded > 0 ? '+' : ''}${formatRawQty(rounded, unit)} ${d.name}`);
  }
  if (rawDeltas.length === 0) {
    return { error: 'No restock quantities provided' };
  }

  const stock = await loadStockMaps(ownerId);
  for (const r of rawDeltas) {
    if ((stock.raw[r.name] || 0) + r.delta < 0) {
      return { error: `原料庫存不足：${r.name}` };
    }
  }

  const deltas: MovementDeltas = {
    giftBoxDeltas: [],
    finishedDeltas: [],
    rawDeltas,
    fulfillments: [],
  };

  await db.transaction(async () => {
    await applyDeltas(ownerId, deltas);
    await insertMovement(ownerId, actorId, 'restock_raw', { summary: summaryParts.join('\n'), deltas }, null);
  });

  return { state: await getState(ownerId) };
}

/** Add finished bottles + consume raw from Kitchen Prep 完成燉製. */
export async function addFinishedFromStewing(
  ownerId: number,
  actorId: number,
  input: {
    finishedDeltas: { sku: string; qty: number }[];
    /** Positive consume amounts (grams / units); stored as negative stock deltas. */
    rawConsume?: { name: string; qty: number }[];
    prepOrderId?: number;
    prepOrderCode?: string;
    remarks?: string | null;
  }
): Promise<{ error?: string }> {
  await ensureSeed(ownerId);
  const allowedSku = new Set(FINISHED_SKUS);
  const allowedRaw = new Set(RAW_MATERIALS.map((m) => m.name));
  const finishedDeltas: MovementDeltas['finishedDeltas'] = [];
  const rawDeltas: MovementDeltas['rawDeltas'] = [];
  const summaryParts: string[] = [];

  if (input.prepOrderCode?.trim()) {
    summaryParts.push(input.prepOrderCode.trim());
  }

  for (const d of input.finishedDeltas || []) {
    if (!allowedSku.has(d.sku)) return { error: `Unknown finished SKU: ${d.sku}` };
    const qty = Math.round(Number(d.qty));
    if (!Number.isFinite(qty) || qty <= 0) continue;
    finishedDeltas.push({ sku: d.sku, delta: qty });
    summaryParts.push(`+${qty} ${finishedSkuLabel(d.sku)}`);
  }

  for (const d of input.rawConsume || []) {
    if (!allowedRaw.has(d.name)) return { error: `Unknown raw material: ${d.name}` };
    const qty = Number(d.qty);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const unit = RAW_MATERIALS.find((m) => m.name === d.name)?.unit || 'g';
    const rounded = roundRawQty(qty, unit);
    if (rounded <= 0) continue;
    rawDeltas.push({ name: d.name, delta: -rounded });
    summaryParts.push(`-${formatRawQty(rounded, unit)}${unit === 'g' ? 'g' : unit} ${d.name}`);
  }

  if (finishedDeltas.length === 0 && rawDeltas.length === 0) {
    return { error: 'No finished bottle or raw quantities to apply' };
  }

  if (input.remarks?.trim()) {
    summaryParts.push(`備註: ${input.remarks.trim()}`);
  }

  const stock = await loadStockMaps(ownerId);
  for (const r of rawDeltas) {
    if ((stock.raw[r.name] || 0) + r.delta < 0) {
      const unit = RAW_MATERIALS.find((m) => m.name === r.name)?.unit || 'g';
      return {
        error: `原料庫存不足：${r.name}（需要 ${formatRawQty(Math.abs(r.delta), unit)}${unit === 'g' ? 'g' : unit}，現有 ${formatRawQty(stock.raw[r.name] || 0, unit)}${unit === 'g' ? 'g' : unit}）`,
      };
    }
  }

  const deltas: MovementDeltas = {
    giftBoxDeltas: [],
    finishedDeltas,
    rawDeltas,
    fulfillments: [],
  };

  await db.transaction(async () => {
    await applyDeltas(ownerId, deltas);
    await insertMovement(
      ownerId,
      actorId,
      'complete_stew',
      {
        summary: summaryParts.join('\n'),
        deltas,
        prepOrderId: input.prepOrderId ?? null,
        prepOrderCode: input.prepOrderCode || null,
      },
      null
    );
  });

  return {};
}

/** Log Kitchen Prep sheet print — no stock change; history action `print_prep_sheet` (列印材料單). */
export async function logPrepSheetPrint(
  ownerId: number,
  actorId: number,
  actorName: string,
  input: { prepOrderId: number; prepOrderCode: string }
): Promise<{ error?: string }> {
  await ensureSeed(ownerId);
  const code = input.prepOrderCode?.trim() || `PREP#${input.prepOrderId}`;
  const name = actorName?.trim() || '—';
  const emptyDeltas: MovementDeltas = {
    giftBoxDeltas: [],
    finishedDeltas: [],
    rawDeltas: [],
    fulfillments: [],
  };

  await insertMovement(
    ownerId,
    actorId,
    'print_prep_sheet',
    {
      summary: `訂單 ${code}\n用戶 ${name}`,
      deltas: emptyDeltas,
      prepOrderId: input.prepOrderId,
      prepOrderCode: code,
      printedByName: name,
    },
    null
  );

  return {};
}

export async function voidMovement(
  ownerId: number,
  actorId: number,
  movementId: number,
  isAdmin: boolean
): Promise<{ error?: string; state?: KitchenState }> {
  if (!isAdmin) return { error: 'Only admin can void movements' };
  await ensureSeed(ownerId);

  const row = (await db
    .prepare('SELECT * FROM kitchen_movements WHERE id = ? AND user_id = ?')
    .get(movementId, ownerId)) as
    | {
        id: number;
        action: string;
        details_json: string;
        voided_at: string | null;
        voids_movement_id: number | null;
      }
    | undefined;

  if (!row) return { error: 'Movement not found' };
  if (row.voided_at) return { error: 'Already voided' };
  if (row.action === 'void') return { error: 'Cannot void a void record' };

  let details: {
    summary?: string;
    deltas?: MovementDeltas;
    prepOrderId?: number | null;
    prepOrderCode?: string | null;
  };
  try {
    details = JSON.parse(row.details_json || '{}');
  } catch {
    return { error: 'Corrupt movement details' };
  }
  if (!details.deltas) return { error: 'Movement has no reversible deltas' };

  const reversed = reverseMovementDeltas(details.deltas);
  const stock = await loadStockMaps(ownerId);
  const neg = wouldGoNegative(reversed, stock);
  if (neg) return { error: neg };

  const prepOrderId =
    row.action === 'complete_stew' && details.prepOrderId != null
      ? Number(details.prepOrderId)
      : null;

  // Also refuse fulfillment reverse below zero (applyDeltas uses GREATEST(0,…))
  await db.transaction(async () => {
    await applyDeltas(ownerId, reversed);
    await db
      .prepare(
        `UPDATE kitchen_movements SET voided_at = to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'), voided_by = ?
         WHERE id = ?`
      )
      .run(actorId, row.id);

    const voidRes = await db
      .prepare(
        `INSERT INTO kitchen_movements (user_id, action, details_json, order_id, created_by, voids_movement_id)
         VALUES (?, 'void', ?, NULL, ?, ?)`
      )
      .run(
        ownerId,
        JSON.stringify({
          summary: details.summary || row.action,
          deltas: reversed,
          voidsMovementId: row.id,
          voidedActionLabel: KITCHEN_ACTION_LABELS[row.action as KitchenAction] || row.action,
        }),
        actorId,
        row.id
      );
    void voidRes;

    if (Number.isFinite(prepOrderId) && prepOrderId! > 0) {
      await db
        .prepare(
          `UPDATE kitchen_prep_orders SET
             status = 'scheduled',
             expected_yield = NULL,
             actual_yield = NULL,
             completion_remarks = NULL,
             completion_splits_json = NULL,
             completed_at = NULL,
             completed_by = NULL,
             updated_at = datetime('now')
           WHERE id = ? AND status = 'completed'`
        )
        .run(prepOrderId);
    }
  });

  return { state: await getState(ownerId, { isAdmin: true }) };
}
