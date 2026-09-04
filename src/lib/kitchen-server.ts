import db from './db';
import {
  RAW_MATERIAL_ALIASES,
  KITCHEN_ACTION_LABELS,
  roundRawQty,
  formatRawQty,
  type KitchenState,
  type KitchenOpenOrder,
  type KitchenNeedLine,
  type KitchenMovement,
  type KitchenAction,
  type KitchenCatalog,
  type KitchenFormulas,
} from './kitchen';
import {
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
  type BomLine,
  type MovementDeltas,
  type StockMaps,
} from './kitchen-bom';
import {
  activeGiftBoxTypes,
  finishedSkusFromCatalog,
  finishedSkuLabelFromCatalog,
  type CatalogGiftBoxType,
} from './kitchen-catalog';
import { ensureCatalogStockRows, loadKitchenCatalog } from './kitchen-catalog-server';
import {
  NESTIEE_ORDER_TYPE,
  WEDDING_GIFT_ORDER_TYPE,
  hydrateNestieeGiftBoxQtys,
  isOrderShipped,
  mapWeddingCapacityToPrep,
  orderTypeFromFields,
} from './orders';
import {
  NESTIEE_SHIPPING_BOX_SLOTS,
  giftCountForOrderShippingBoxes,
  mapShippingBoxesForGiftCount,
  shippingBoxDisplayLabel,
  totalGiftBoxesInOrder,
  type NestieeShippingBoxId,
} from './nestiee-order-demand';
import { kitchenShortagesFromNeeds, type KitchenShortage } from './kitchen-ship-allocate';
import {
  aggregateRawNeedsFromPrepOrders,
  bomRawDisplayLabel,
  isUntrackedStewIngredient,
  parseBirdNestType,
  resolveRawStockName,
  type BirdNestType,
  type PrepCapacity,
  type PrepFlavor,
  type PrepOrderType,
  type PrepStatus,
} from './kitchen-prep';

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

/** Process-local: avoid re-running seed INSERT chatter on every kitchen request. */
const seededOwnerIds = new Set<number>();

/** Process-local cache — kitchen data owner is stable for the process lifetime. */
let cachedKitchenOwnerId: number | null = null;

/** Shared kitchen data owner — prep schedule + inventory visible company-wide. */
export async function resolveKitchenOwnerUserId(): Promise<number> {
  if (cachedKitchenOwnerId != null) return cachedKitchenOwnerId;

  const configured = Number(process.env.KITCHEN_OWNER_USER_ID || process.env.HUB_OWNER_USER_ID);
  if (Number.isFinite(configured) && configured > 0) {
    cachedKitchenOwnerId = configured;
    return configured;
  }

  const admin = (await db
    .prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1")
    .get()) as { id: number } | undefined;
  if (admin) {
    cachedKitchenOwnerId = admin.id;
    return admin.id;
  }

  const anyUser = (await db.prepare('SELECT id FROM users ORDER BY id LIMIT 1').get()) as
    | { id: number }
    | undefined;
  if (!anyUser) throw new Error('No users in database — register an account first');
  cachedKitchenOwnerId = anyUser.id;
  return anyUser.id;
}

function isShippedKitchenStatus(
  status: string | null | undefined,
  fields: Record<string, unknown>,
): boolean {
  return isOrderShipped({ status: status ?? '', fields });
}

export async function ensureSeed(userId: number, catalog: KitchenCatalog) {
  if (seededOwnerIds.has(userId)) return;

  await ensureCatalogStockRows(userId, catalog);

  // Fold legacy alias rows (頂級乾燕餅→燕餅, 燕窩冰糖→冰糖) into canonical stock.
  const aliasNames = Object.keys(RAW_MATERIAL_ALIASES);
  if (aliasNames.length > 0) {
    const ph = aliasNames.map(() => '?').join(', ');
    const aliasRows = (await db
      .prepare(
        `SELECT name, total_stock, allocated_stock FROM kitchen_raw WHERE user_id = ? AND name IN (${ph})`
      )
      .all(userId, ...aliasNames)) as { name: string; total_stock: number; allocated_stock: number }[];

    for (const aliasRow of aliasRows) {
      const canonical = RAW_MATERIAL_ALIASES[aliasRow.name];
      if (!canonical) continue;
      const total = Number(aliasRow.total_stock) || 0;
      const alloc = Number(aliasRow.allocated_stock) || 0;
      if (total !== 0 || alloc !== 0) {
        const def = catalog.rawMaterials.find((m) => m.name === canonical);
        await ensureRawRow(userId, canonical, def?.unit || 'g');
        await db
          .prepare(
            'UPDATE kitchen_raw SET total_stock = total_stock + ?, allocated_stock = allocated_stock + ? WHERE user_id = ? AND name = ?'
          )
          .run(total, alloc, userId, canonical);
      }
      await db.prepare('DELETE FROM kitchen_raw WHERE user_id = ? AND name = ?').run(userId, aliasRow.name);
    }
  }

  seededOwnerIds.add(userId);
}

/** Call after catalog edits so newly added SKUs/raw/boxes get stock rows. */
export function invalidateKitchenSeedCache(userId?: number) {
  if (userId == null) seededOwnerIds.clear();
  else seededOwnerIds.delete(userId);
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

async function ensureShippingBoxRow(userId: number, boxId: string) {
  await db
    .prepare('INSERT OR IGNORE INTO kitchen_shipping_boxes (user_id, box_id, quantity) VALUES (?, ?, 0)')
    .run(userId, boxId);
}

type KitchenStockMaps = StockMaps & { shippingBoxes: Record<string, number> };

async function loadStockMaps(userId: number, catalog: KitchenCatalog): Promise<KitchenStockMaps> {
  const skus = finishedSkusFromCatalog(catalog);
  const skuSet = new Set(skus);
  const rawDefs = catalog.rawMaterials.filter((m) => !isUntrackedStewIngredient(m.name));
  const giftTypes = catalog.giftBoxTypes;

  const [finishedRows, rawRows, giftRows, shippingRows] = await Promise.all([
    db
      .prepare('SELECT sku, quantity FROM kitchen_finished WHERE user_id = ?')
      .all(userId) as Promise<{ sku: string; quantity: number }[]>,
    db
      .prepare('SELECT name, total_stock FROM kitchen_raw WHERE user_id = ?')
      .all(userId) as Promise<{ name: string; total_stock: number }[]>,
    db
      .prepare('SELECT box_type, quantity FROM kitchen_gift_boxes WHERE user_id = ?')
      .all(userId) as Promise<{ box_type: string; quantity: number }[]>,
    db
      .prepare('SELECT box_id, quantity FROM kitchen_shipping_boxes WHERE user_id = ?')
      .all(userId) as Promise<{ box_id: string; quantity: number }[]>,
  ]);

  const finished: Record<string, number> = {};
  for (const sku of skus) finished[sku] = 0;
  for (const r of finishedRows) {
    if (skuSet.has(r.sku)) finished[r.sku] = Number(r.quantity) || 0;
  }

  const raw: Record<string, number> = {};
  for (const m of rawDefs) raw[m.name] = 0;
  for (const r of rawRows) {
    const def = rawDefs.find((m) => m.name === r.name);
    if (!def) continue;
    raw[r.name] = roundRawQty(Number(r.total_stock) || 0, def.unit || 'g');
  }

  const giftBoxes: Record<string, number> = {};
  for (const g of giftTypes) giftBoxes[g.id] = 0;
  for (const r of giftRows) {
    if (giftBoxes[r.box_type] !== undefined || giftTypes.some((g) => g.id === r.box_type)) {
      giftBoxes[r.box_type] = Number(r.quantity) || 0;
    }
  }

  const shippingBoxes: Record<string, number> = {};
  for (const slot of NESTIEE_SHIPPING_BOX_SLOTS) shippingBoxes[slot.id] = 0;
  for (const r of shippingRows) {
    if (shippingBoxes[r.box_id] !== undefined) {
      shippingBoxes[r.box_id] = Number(r.quantity) || 0;
    }
  }

  return { finished, raw, giftBoxes, shippingBoxes };
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
  reference_number: string;
  po_number: string | null;
  name: string | null;
  order_type: string | null;
  fields_json: string | null;
  status?: string | null;
}

/** Merge denormalized orders.order_type into parsed fields_json for kitchen reads. */
export function orderFieldsFromRow(row: Pick<OrderRow, 'fields_json' | 'order_type'>): Record<string, unknown> {
  const fields = parseFields(row.fields_json);
  const columnType = String(row.order_type || '').trim();
  if (columnType && !orderTypeFromFields(fields)) {
    fields.order_type = columnType;
  }
  return fields;
}

function nestieeNeeds(
  order: OrderRow,
  fields: Record<string, unknown>,
  fulfillments: Map<string, number>,
  giftTypes: CatalogGiftBoxType[]
): KitchenNeedLine[] {
  const hydrated = hydrateNestieeGiftBoxQtys({ ...fields });
  const needs: KitchenNeedLine[] = [];
  for (const g of giftTypes) {
    if (!g.active) continue;
    const required = fieldNum(hydrated, g.qtyKey);
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
  fulfillments: Map<string, number>,
  catalog: KitchenCatalog
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
      label: `${finishedSkuLabelFromCatalog(sku, catalog)} ×${required}`,
      required,
      fulfilled,
      remaining,
      done: remaining === 0,
    });
  }
  return needs;
}

async function loadOpenOrders(
  userId: number,
  fulfillments: Map<string, number>,
  catalog: KitchenCatalog
): Promise<{ orders: KitchenOpenOrder[]; shippingDemand: Record<string, number> }> {
  const rows = (await db
    .prepare(
      `SELECT id, reference_number, po_number, name, status, order_type, fields_json
       FROM orders
       WHERE user_id = ?
         AND (
           order_type IN (?, ?)
           OR COALESCE(fields_json::jsonb->>'order_type', '') IN (?, ?)
         )
         AND COALESCE(TRIM(status), '') <> '已寄出 SENT'
         AND (status IS NULL OR status !~* '\\ySENT\\y')
       ORDER BY id DESC`
    )
    .all(userId, NESTIEE_ORDER_TYPE, WEDDING_GIFT_ORDER_TYPE, NESTIEE_ORDER_TYPE, WEDDING_GIFT_ORDER_TYPE)) as OrderRow[];

  const giftTypes = catalog.giftBoxTypes;
  const activeGiftTypes = giftTypes.filter((g) => g.active);
  const shippingDemand: Record<string, number> = {};
  for (const slot of NESTIEE_SHIPPING_BOX_SLOTS) shippingDemand[slot.id] = 0;
  const out: KitchenOpenOrder[] = [];
  for (const row of rows) {
    const fields = orderFieldsFromRow(row);
    // Hide shipped orders from the kitchen list.
    if (isShippedKitchenStatus(row.status, fields)) continue;

    const ot = orderTypeFromFields(fields) || '';
    let type: 'nestiee' | 'return_gift' | null = null;
    let typeLabel = '';
    let needs: KitchenNeedLine[] = [];

    if (ot === NESTIEE_ORDER_TYPE) {
      type = 'nestiee';
      typeLabel = 'Nestiee';
      needs = nestieeNeeds(row, fields, fulfillments, giftTypes);
      const hydrated = hydrateNestieeGiftBoxQtys({ ...fields });
      const giftTotal = totalGiftBoxesInOrder(hydrated, activeGiftTypes);
      const shipping = mapShippingBoxesForGiftCount(giftCountForOrderShippingBoxes(giftTotal));
      for (const id of Object.keys(shipping) as NestieeShippingBoxId[]) {
        shippingDemand[id] += shipping[id];
      }
    } else if (ot === WEDDING_GIFT_ORDER_TYPE) {
      type = 'return_gift';
      typeLabel = '回禮';
      needs = returnGiftNeeds(row, fields, fulfillments, catalog);
    } else {
      continue;
    }

    if (needs.length === 0) continue;
    const fullyFulfilled = needs.every((n) => n.done);

    out.push({
      id: row.id,
      referenceNumber: row.reference_number,
      poNumber: row.po_number?.trim() || '',
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
  return { orders: out, shippingDemand };
}

function computeDemand(
  openOrders: KitchenOpenOrder[],
  giftBoxBoms: Record<string, BomLine[]>,
  shippingDemand: Record<string, number> = {}
): KitchenState['demand'] {
  const giftBoxes: Record<string, number> = {};
  const finished: Record<string, number> = {};
  const raw: Record<string, number> = {};

  for (const o of openOrders) {
    for (const n of o.needs) {
      if (n.remaining <= 0) continue;
      if (n.needKey.startsWith('gift:')) {
        const boxType = n.needKey.slice(5);
        giftBoxes[boxType] = (giftBoxes[boxType] || 0) + n.remaining;
        const bom = expandGiftBoxBom(boxType, n.remaining, giftBoxBoms);
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
  const shippingBoxes: Record<string, number> = {};
  for (const slot of NESTIEE_SHIPPING_BOX_SLOTS) {
    shippingBoxes[slot.id] = shippingDemand[slot.id] || 0;
  }
  return { giftBoxes, finished, raw, shippingBoxes };
}

async function loadUnfinishedPrepRawDemand(
  userId: number,
  formulas: KitchenFormulas
): Promise<Record<string, number>> {
  const rows = (await db
    .prepare(
      `SELECT capacity, order_type, status, qty_osmanthus, qty_red_date, qty_rock_sugar,
              actual_qty_osmanthus, actual_qty_red_date, actual_qty_rock_sugar,
              bird_nest_osmanthus, bird_nest_red_date, bird_nest_rock_sugar
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
    actual_qty_osmanthus: number | null;
    actual_qty_red_date: number | null;
    actual_qty_rock_sugar: number | null;
    bird_nest_osmanthus: string | null;
    bird_nest_red_date: string | null;
    bird_nest_rock_sugar: string | null;
  }[];
  return aggregateRawNeedsFromPrepOrders(rows, formulas.stewFormulas);
}

export async function loadKitchenMovements(userId: number): Promise<KitchenMovement[]> {
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

export interface GetStateOptions {
  isAdmin?: boolean;
  /** Default true. Set false for lite dashboard loads (lazy-fetch movements). */
  includeMovements?: boolean;
  /** Default true. Set false to skip DB stock reads (quantities stay 0; needed still computed). */
  includeInventory?: boolean;
  /** Default true. Set false to skip open-order reads (empty list until lazy-loaded). */
  includeOrders?: boolean;
}

const EMPTY_STOCK: KitchenStockMaps = { finished: {}, raw: {}, giftBoxes: {}, shippingBoxes: {} };

function buildInventoryRows(
  catalog: KitchenCatalog,
  stock: KitchenStockMaps,
  demand: KitchenState['demand']
): Pick<KitchenState, 'giftBoxes' | 'finished' | 'raw' | 'shippingBoxes'> {
  const giftBoxes = activeGiftBoxTypes(catalog).map((g) => ({
    boxType: g.id,
    label: g.label,
    quantity: stock.giftBoxes[g.id] || 0,
    needed: demand.giftBoxes[g.id] || 0,
  }));

  const finished = finishedSkusFromCatalog(catalog).map((sku) => ({
    sku,
    label: finishedSkuLabelFromCatalog(sku, catalog),
    quantity: stock.finished[sku] || 0,
    needed: demand.finished[sku] || 0,
  }));

  const raw = [...catalog.rawMaterials]
    .filter((m) => !isUntrackedStewIngredient(m.name))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((m) => ({
      name: m.name,
      unit: m.unit,
      quantity: roundRawQty(stock.raw[m.name] || 0, m.unit),
      needed: roundRawQty(demand.raw[m.name] || 0, m.unit),
    }));

  const shippingBoxes = NESTIEE_SHIPPING_BOX_SLOTS.map((slot) => ({
    boxId: slot.id,
    label: shippingBoxDisplayLabel(slot),
    quantity: stock.shippingBoxes[slot.id] || 0,
    needed: demand.shippingBoxes[slot.id] || 0,
  }));

  return { giftBoxes, finished, raw, shippingBoxes };
}

export type KitchenInventorySlice = Pick<
  KitchenState,
  'giftBoxes' | 'finished' | 'raw' | 'shippingBoxes' | 'demand'
>;

/** Load on-hand stock quantities merged with current open-order demand. */
export async function getInventorySlice(userId: number): Promise<KitchenInventorySlice> {
  const { catalog, formulas } = await loadKitchenCatalog(userId);
  await ensureSeed(userId, catalog);

  const [stock, fulfillments, unfinishedRaw] = await Promise.all([
    loadStockMaps(userId, catalog),
    loadFulfillments(userId),
    loadUnfinishedPrepRawDemand(userId, formulas),
  ]);
  const { orders: openOrders, shippingDemand } = await loadOpenOrders(userId, fulfillments, catalog);
  const demand = computeDemand(openOrders, formulas.giftBoxBoms, shippingDemand);
  demand.raw = unfinishedRaw;

  return {
    demand,
    ...buildInventoryRows(catalog, stock, demand),
  };
}

export type KitchenOrdersSlice = Pick<KitchenState, 'openOrders' | 'demand'>;

/** Load Nestiee / 回禮 open orders and derived demand. */
export async function getOpenOrdersSlice(userId: number): Promise<KitchenOrdersSlice> {
  const { catalog, formulas } = await loadKitchenCatalog(userId);
  await ensureSeed(userId, catalog);

  const [fulfillments, unfinishedRaw] = await Promise.all([
    loadFulfillments(userId),
    loadUnfinishedPrepRawDemand(userId, formulas),
  ]);
  const { orders: openOrders, shippingDemand } = await loadOpenOrders(userId, fulfillments, catalog);
  const demand = computeDemand(openOrders, formulas.giftBoxBoms, shippingDemand);
  demand.raw = unfinishedRaw;

  return { openOrders, demand };
}

export async function getState(userId: number, opts?: GetStateOptions): Promise<KitchenState> {
  const includeMovements = opts?.includeMovements !== false;
  const includeInventory = opts?.includeInventory !== false;
  const includeOrders = opts?.includeOrders !== false;

  const { catalog, formulas } = await loadKitchenCatalog(userId);
  await ensureSeed(userId, catalog);

  const fulfillmentsPromise = includeOrders
    ? loadFulfillments(userId)
    : Promise.resolve(new Map<string, number>());
  const openOrdersPromise = includeOrders
    ? fulfillmentsPromise.then((fulfillments) => loadOpenOrders(userId, fulfillments, catalog))
    : Promise.resolve({
        orders: [] as KitchenOpenOrder[],
        shippingDemand: Object.fromEntries(
          NESTIEE_SHIPPING_BOX_SLOTS.map((slot) => [slot.id, 0])
        ) as Record<string, number>,
      });
  const independentPromise = Promise.all([
    includeInventory ? loadStockMaps(userId, catalog) : Promise.resolve(EMPTY_STOCK),
    includeMovements ? loadKitchenMovements(userId) : Promise.resolve([] as KitchenMovement[]),
    loadUnfinishedPrepRawDemand(userId, formulas),
    getHolidayMode(userId),
  ]);

  const [openOrdersResult, [stock, movements, unfinishedRaw, holidayMode]] = await Promise.all([
    openOrdersPromise,
    independentPromise,
  ]);
  const { orders: openOrders, shippingDemand } = openOrdersResult;

  const demand = computeDemand(openOrders, formulas.giftBoxBoms, shippingDemand);
  demand.raw = unfinishedRaw;

  const { giftBoxes, finished, raw, shippingBoxes } = buildInventoryRows(catalog, stock, demand);

  return {
    giftBoxes,
    finished,
    raw,
    shippingBoxes,
    demand,
    openOrders,
    movements,
    isAdmin: Boolean(opts?.isAdmin),
    holidayMode,
    catalog,
    formulas,
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

async function applyDeltas(userId: number, deltas: MovementDeltas, catalog: KitchenCatalog) {
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
    const def = catalog.rawMaterials.find((m) => m.name === r.name);
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
         VALUES (?, ?, ?, GREATEST(0, ?), to_char(NOW() AT TIME ZONE 'Asia/Hong_Kong', 'YYYY-MM-DD HH24:MI:SS'))
         ON CONFLICT (user_id, order_id, need_key) DO UPDATE SET
           fulfilled_qty = GREATEST(0, kitchen_order_fulfillments.fulfilled_qty + ?),
           updated_at = to_char(NOW() AT TIME ZONE 'Asia/Hong_Kong', 'YYYY-MM-DD HH24:MI:SS')`
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
      `INSERT INTO kitchen_movements (user_id, action, details_json, order_id, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`
    )
    .run(userId, action, JSON.stringify(details), orderId, actorId);
  return Number(res.lastInsertRowid);
}

function giftBoxLabel(boxType: string, catalog: KitchenCatalog): string {
  return catalog.giftBoxTypes.find((g) => g.id === boxType)?.label || boxType;
}

function skuLabel(sku: string, catalog: KitchenCatalog): string {
  return finishedSkuLabelFromCatalog(sku, catalog) || finishedSkuLabel(sku);
}

export async function makeGiftBox(
  ownerId: number,
  actorId: number,
  input: {
    boxType: string;
    quantity: number;
    consumeOverrides?: Record<string, number>;
    birdNestType?: BirdNestType;
  }
): Promise<{
  error?: string;
  state?: KitchenState;
  finished_shortfalls?: { capacity: string; qtys: { osmanthus: number; red_date: number; rock_sugar: number } }[];
}> {
  const { catalog, formulas } = await loadKitchenCatalog(ownerId);
  await ensureSeed(ownerId, catalog);
  const boxType = input.boxType;
  if (!catalog.giftBoxTypes.some((g) => g.id === boxType && g.active)) {
    return { error: 'Invalid gift box type' };
  }
  const qty = Math.max(1, Math.floor(Number(input.quantity) || 0));
  if (!qty) return { error: 'Quantity must be at least 1' };
  const birdNestType = parseBirdNestType(input.birdNestType);

  const defaults = expandGiftBoxBom(boxType, qty, formulas.giftBoxBoms);
  const resolved = applyBomQtyOverrides(defaults, input.consumeOverrides);
  if (resolved.error) return { error: resolved.error };
  const lines = resolved.lines;
  const stock = await loadStockMaps(ownerId, catalog);

  const finishedShort: string[] = [];
  const rawShort: string[] = [];
  for (const line of lines) {
    if (line.kind === 'finished') {
      if ((stock.finished[line.sku] || 0) < line.qty) {
        finishedShort.push(
          `成品不足：${skuLabel(line.sku, catalog)}（需要 ${line.qty}，現有 ${stock.finished[line.sku] || 0}）`
        );
      }
    } else {
      const stockName = resolveRawStockName(line.name, birdNestType);
      if ((stock.raw[stockName] || 0) < line.qty) {
        rawShort.push(
          `原料不足：${bomRawDisplayLabel(line.name, birdNestType)}（需要 ${line.qty}，現有 ${stock.raw[stockName] || 0}）`
        );
      }
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
      .map((l) => ({ name: resolveRawStockName(l.name, birdNestType), delta: -l.qty })),
    fulfillments: [],
  };

  const summaryParts = [`+${qty} ${giftBoxLabel(boxType, catalog)}`];
  for (const l of lines) {
    summaryParts.push(
      l.kind === 'finished'
        ? `−${l.qty} ${skuLabel(l.sku, catalog)}`
        : `−${l.qty} ${bomRawDisplayLabel(l.name, birdNestType)}`
    );
  }

  await db.transaction(async () => {
    await applyDeltas(ownerId, deltas, catalog);
    await insertMovement(
      ownerId,
      actorId,
      'make_gift_box',
      { summary: summaryParts.join('\n'), deltas, boxType, quantity: qty, birdNestType },
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
  const { catalog } = await loadKitchenCatalog(ownerId);
  await ensureSeed(ownerId, catalog);
  const boxType = input.boxType;
  if (!catalog.giftBoxTypes.some((g) => g.id === boxType)) {
    return { error: 'Invalid gift box type' };
  }
  const qty = Math.max(1, Math.floor(Number(input.quantity) || 0));
  if (!qty) return { error: 'Quantity must be at least 1' };

  const orderId = Number(input.orderId);
  if (!orderId) return { error: 'orderId required' };

  const order = (await db
    .prepare('SELECT id, po_number, order_type, fields_json FROM orders WHERE id = ? AND user_id = ?')
    .get(orderId, ownerId)) as OrderRow | undefined;
  if (!order) return { error: 'Order not found' };

  const fields = orderFieldsFromRow(order);
  if (orderTypeFromFields(fields) !== NESTIEE_ORDER_TYPE) {
    return { error: 'Order is not a Nestiee order' };
  }

  const fulfillments = await loadFulfillments(ownerId);
  const needs = nestieeNeeds(order, fields, fulfillments, catalog.giftBoxTypes);
  const needKey = giftNeedKey(boxType);
  const line = needs.find((n) => n.needKey === needKey);
  if (!line || line.remaining <= 0) return { error: '此禮盒類型無需再分配' };
  if (qty > line.remaining) {
    return { error: `超過剩餘需要（最多 ${line.remaining}）` };
  }

  const stock = await loadStockMaps(ownerId, catalog);
  if ((stock.giftBoxes[boxType] || 0) < qty) {
    return {
      error: `禮盒庫存不足：${giftBoxLabel(boxType, catalog)}（需要 ${qty}，現有 ${stock.giftBoxes[boxType] || 0}）`,
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
    `−${giftBoxLabel(boxType, catalog)} ${qty}`,
  ].join('\n');

  await db.transaction(async () => {
    await applyDeltas(ownerId, deltas, catalog);
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
  const { catalog } = await loadKitchenCatalog(ownerId);
  await ensureSeed(ownerId, catalog);
  const orderId = Number(input.orderId);
  const row = (await db
    .prepare('SELECT id, po_number, order_type, fields_json FROM orders WHERE id = ? AND user_id = ?')
    .get(orderId, ownerId)) as OrderRow | undefined;
  if (!row) return { error: 'Order not found' };

  const fields = orderFieldsFromRow(row);
  if (orderTypeFromFields(fields) !== WEDDING_GIFT_ORDER_TYPE) {
    return { error: 'Order is not a 回禮 order' };
  }

  const fulfillments = await loadFulfillments(ownerId);
  const needs = returnGiftNeeds(row, fields, fulfillments, catalog).filter((n) => n.remaining > 0);
  if (needs.length === 0) return { error: 'No remaining bottles to fulfill' };

  const needByKey = new Map(needs.map((n) => [n.needKey, n]));
  const requested =
    Array.isArray(input.lines) && input.lines.length > 0
      ? input.lines
      : needs.map((n) => ({ needKey: n.needKey, qty: n.remaining }));

  const stock = await loadStockMaps(ownerId, catalog);
  const finishedDeltas: MovementDeltas['finishedDeltas'] = [];
  const fulRows: MovementDeltas['fulfillments'] = [];

  for (const line of requested) {
    const qty = Math.floor(Number(line.qty) || 0);
    if (qty <= 0) continue;
    const n = needByKey.get(line.needKey);
    if (!n) return { error: `Unknown need line: ${line.needKey}` };
    if (qty > n.remaining) {
      return { error: `${skuLabel(n.needKey.slice(7), catalog)} 超過剩餘需要（最多 ${n.remaining}）` };
    }
    const sku = n.needKey.slice(7);
    if ((stock.finished[sku] || 0) < qty) {
      return {
        error: `成品不足：${skuLabel(sku, catalog)}（需要 ${qty}，現有 ${stock.finished[sku] || 0}）`,
      };
    }
    finishedDeltas.push({ sku, delta: -qty });
    fulRows.push({ orderId, needKey: n.needKey, qty });
    stock.finished[sku] = (stock.finished[sku] || 0) - qty;
  }

  if (fulRows.length === 0) return { error: '請至少製作 1 樽' };

  const cleanSummary = [
    `PO# ${row.po_number || orderId}`,
    ...fulRows.map((f) => `−${skuLabel(f.needKey.slice(7), catalog)} ${f.qty}`),
  ];

  const deltas: MovementDeltas = {
    giftBoxDeltas: [],
    finishedDeltas,
    rawDeltas: [],
    fulfillments: fulRows,
  };

  await db.transaction(async () => {
    await applyDeltas(ownerId, deltas, catalog);
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

export type AllocateRemainingResult =
  | { ok: true; allocated: boolean; summary?: string }
  | { ok: false; shortages: KitchenShortage[] };

/**
 * Deduct remaining Nestiee gift boxes / 回禮 bottles for an order.
 * No writes when stock is short. No-op for other order types or fully allocated orders.
 */
export async function tryAllocateRemainingForOrder(
  ownerId: number,
  actorId: number,
  orderId: number,
): Promise<AllocateRemainingResult> {
  const { catalog } = await loadKitchenCatalog(ownerId);
  await ensureSeed(ownerId, catalog);

  const order = (await db
    .prepare('SELECT id, po_number, order_type, fields_json FROM orders WHERE id = ? AND user_id = ?')
    .get(orderId, ownerId)) as OrderRow | undefined;
  if (!order) return { ok: true, allocated: false };

  const fields = orderFieldsFromRow(order);
  const ot = orderTypeFromFields(fields) || '';
  const fulfillments = await loadFulfillments(ownerId);

  let kind: 'nestiee' | 'return_gift' | null = null;
  let needs: KitchenNeedLine[] = [];
  if (ot === NESTIEE_ORDER_TYPE) {
    kind = 'nestiee';
    needs = nestieeNeeds(order, fields, fulfillments, catalog.giftBoxTypes);
  } else if (ot === WEDDING_GIFT_ORDER_TYPE) {
    kind = 'return_gift';
    needs = returnGiftNeeds(order, fields, fulfillments, catalog);
  } else {
    return { ok: true, allocated: false };
  }

  const remaining = needs.filter((n) => n.remaining > 0);
  if (remaining.length === 0) return { ok: true, allocated: false };

  const stockLines = remaining.map((n) => {
    let label = n.label;
    if (n.needKey.startsWith('gift:')) label = giftBoxLabel(n.needKey.slice(5), catalog);
    else if (n.needKey.startsWith('bottle:')) label = skuLabel(n.needKey.slice(7), catalog);
    return { needKey: n.needKey, remaining: n.remaining, label };
  });

  const stock = await loadStockMaps(ownerId, catalog);
  const shortages = kitchenShortagesFromNeeds(stockLines, stock);
  if (shortages.length > 0) return { ok: false, shortages };

  const giftBoxDeltas: MovementDeltas['giftBoxDeltas'] = [];
  const finishedDeltas: MovementDeltas['finishedDeltas'] = [];
  const fulRows: MovementDeltas['fulfillments'] = [];
  const summaryLines = [`PO# ${order.po_number || orderId}`, 'auto-allocated on ship'];

  for (const n of remaining) {
    if (kind === 'nestiee' && n.needKey.startsWith('gift:')) {
      const boxType = n.needKey.slice(5);
      giftBoxDeltas.push({ boxType, delta: -n.remaining });
      fulRows.push({ orderId, needKey: n.needKey, qty: n.remaining });
      summaryLines.push(`−${giftBoxLabel(boxType, catalog)} ${n.remaining}`);
    } else if (kind === 'return_gift' && n.needKey.startsWith('bottle:')) {
      const sku = n.needKey.slice(7);
      finishedDeltas.push({ sku, delta: -n.remaining });
      fulRows.push({ orderId, needKey: n.needKey, qty: n.remaining });
      summaryLines.push(`−${skuLabel(sku, catalog)} ${n.remaining}`);
    }
  }

  if (fulRows.length === 0) return { ok: true, allocated: false };

  const deltas: MovementDeltas = {
    giftBoxDeltas,
    finishedDeltas,
    rawDeltas: [],
    fulfillments: fulRows,
  };
  const summary = summaryLines.join('\n');
  const action: KitchenAction = kind === 'nestiee' ? 'allocate_gift_box' : 'make_return_gift';

  await db.transaction(async () => {
    await applyDeltas(ownerId, deltas, catalog);
    await insertMovement(ownerId, actorId, action, { summary, deltas }, orderId);
  });

  return { ok: true, allocated: true, summary };
}

export async function restockRaw(
  ownerId: number,
  actorId: number,
  input: {
    deltas: { name: string; qty: number }[];
  }
): Promise<{ error?: string; state?: KitchenState }> {
  const { catalog } = await loadKitchenCatalog(ownerId);
  await ensureSeed(ownerId, catalog);
  const allowedRaw = new Set(catalog.rawMaterials.map((m) => m.name));
  const rawDeltas: MovementDeltas['rawDeltas'] = [];
  const summaryParts: string[] = [];

  for (const d of input.deltas || []) {
    if (!allowedRaw.has(d.name)) return { error: `Unknown raw material: ${d.name}` };
    const qty = Number(d.qty);
    if (!Number.isFinite(qty) || qty === 0) continue;
    const unit = catalog.rawMaterials.find((m) => m.name === d.name)?.unit || 'g';
    const rounded = roundRawQty(qty, unit);
    if (rounded === 0) continue;
    rawDeltas.push({ name: d.name, delta: rounded });
    summaryParts.push(`${rounded > 0 ? '+' : ''}${formatRawQty(rounded, unit)} ${d.name}`);
  }
  if (rawDeltas.length === 0) {
    return { error: 'No restock quantities provided' };
  }

  const stock = await loadStockMaps(ownerId, catalog);
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
    await applyDeltas(ownerId, deltas, catalog);
    await insertMovement(ownerId, actorId, 'restock_raw', { summary: summaryParts.join('\n'), deltas }, null);
  });

  return { state: await getState(ownerId) };
}

/** Admin: set absolute stock for raw / finished / gift box / shipping box. */
export async function adjustStock(
  ownerId: number,
  actorId: number,
  isAdmin: boolean,
  input: { kind: 'raw' | 'finished' | 'gift_box' | 'shipping_box'; key: string; quantity: number }
): Promise<{ error?: string; state?: KitchenState }> {
  if (!isAdmin) return { error: 'Only admin can adjust stock' };
  const { catalog } = await loadKitchenCatalog(ownerId);
  await ensureSeed(ownerId, catalog);
  const kind = input.kind;
  const key = String(input.key || '').trim();
  if (!key) return { error: 'key required' };

  const stock = await loadStockMaps(ownerId, catalog);
  const deltas: MovementDeltas = {
    giftBoxDeltas: [],
    finishedDeltas: [],
    rawDeltas: [],
    fulfillments: [],
  };

  let from = 0;
  let to = 0;
  let summary = '';

  if (kind === 'raw') {
    const def = catalog.rawMaterials.find((m) => m.name === key);
    if (!def) return { error: `Unknown raw material: ${key}` };
    const unit = def.unit || 'g';
    from = stock.raw[key] || 0;
    to = roundRawQty(Number(input.quantity), unit);
    if (!Number.isFinite(Number(input.quantity)) || to < 0) return { error: 'Quantity must be ≥ 0' };
    const delta = roundRawQty(to - from, unit);
    if (delta === 0) return { error: 'No change' };
    deltas.rawDeltas.push({ name: key, delta });
    summary = `${key}: ${formatRawQty(from, unit)} → ${formatRawQty(to, unit)}`;
  } else if (kind === 'finished') {
    const allowed = new Set(finishedSkusFromCatalog(catalog));
    if (!allowed.has(key)) return { error: `Unknown finished SKU: ${key}` };
    from = stock.finished[key] || 0;
    to = Math.floor(Number(input.quantity));
    if (!Number.isFinite(to) || to < 0) return { error: 'Quantity must be ≥ 0' };
    const delta = to - from;
    if (delta === 0) return { error: 'No change' };
    deltas.finishedDeltas.push({ sku: key, delta });
    summary = `${skuLabel(key, catalog)}: ${from} → ${to}`;
  } else if (kind === 'gift_box') {
    if (!catalog.giftBoxTypes.some((g) => g.id === key)) return { error: `Unknown gift box: ${key}` };
    from = stock.giftBoxes[key] || 0;
    to = Math.floor(Number(input.quantity));
    if (!Number.isFinite(to) || to < 0) return { error: 'Quantity must be ≥ 0' };
    const delta = to - from;
    if (delta === 0) return { error: 'No change' };
    deltas.giftBoxDeltas.push({ boxType: key, delta });
    summary = `${giftBoxLabel(key, catalog)}: ${from} → ${to}`;
  } else if (kind === 'shipping_box') {
    const slot = NESTIEE_SHIPPING_BOX_SLOTS.find((s) => s.id === key);
    if (!slot) return { error: `Unknown shipping box: ${key}` };
    from = stock.shippingBoxes[key] || 0;
    to = Math.floor(Number(input.quantity));
    if (!Number.isFinite(to) || to < 0) return { error: 'Quantity must be ≥ 0' };
    if (to === from) return { error: 'No change' };
    await ensureShippingBoxRow(ownerId, key);
    await db
      .prepare('UPDATE kitchen_shipping_boxes SET quantity = ? WHERE user_id = ? AND box_id = ?')
      .run(to, ownerId, key);
    summary = `${shippingBoxDisplayLabel(slot)}: ${from} → ${to}`;
    await insertMovement(
      ownerId,
      actorId,
      'adjust_stock',
      { summary, deltas, kind, key, from, to },
      null
    );
    return { state: await getState(ownerId, { isAdmin: true }) };
  } else {
    return { error: 'Invalid kind' };
  }

  await db.transaction(async () => {
    await applyDeltas(ownerId, deltas, catalog);
    await insertMovement(
      ownerId,
      actorId,
      'adjust_stock',
      { summary, deltas, kind, key, from, to },
      null
    );
  });

  return { state: await getState(ownerId, { isAdmin: true }) };
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
  const { catalog } = await loadKitchenCatalog(ownerId);
  await ensureSeed(ownerId, catalog);
  const allowedSku = new Set(finishedSkusFromCatalog(catalog));
  const allowedRaw = new Set(catalog.rawMaterials.map((m) => m.name));
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
    summaryParts.push(`+${qty} ${skuLabel(d.sku, catalog)}`);
  }

  for (const d of input.rawConsume || []) {
    if (isUntrackedStewIngredient(d.name)) continue;
    if (!allowedRaw.has(d.name)) return { error: `Unknown raw material: ${d.name}` };
    const qty = Number(d.qty);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const unit = catalog.rawMaterials.find((m) => m.name === d.name)?.unit || 'g';
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

  const stock = await loadStockMaps(ownerId, catalog);
  for (const r of rawDeltas) {
    if ((stock.raw[r.name] || 0) + r.delta < 0) {
      const unit = catalog.rawMaterials.find((m) => m.name === r.name)?.unit || 'g';
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
    await applyDeltas(ownerId, deltas, catalog);
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
  const { catalog } = await loadKitchenCatalog(ownerId);
  await ensureSeed(ownerId, catalog);
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
  const { catalog } = await loadKitchenCatalog(ownerId);
  await ensureSeed(ownerId, catalog);

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
  const stock = await loadStockMaps(ownerId, catalog);
  const neg = wouldGoNegative(reversed, stock);
  if (neg) return { error: neg };

  const prepOrderId =
    row.action === 'complete_stew' && details.prepOrderId != null
      ? Number(details.prepOrderId)
      : null;

  // Also refuse fulfillment reverse below zero (applyDeltas uses GREATEST(0,…))
  await db.transaction(async () => {
    await applyDeltas(ownerId, reversed, catalog);
    await db
      .prepare(
        `UPDATE kitchen_movements SET voided_at = to_char(NOW() AT TIME ZONE 'Asia/Hong_Kong', 'YYYY-MM-DD HH24:MI:SS'), voided_by = ?
         WHERE id = ?`
      )
      .run(actorId, row.id);

    const voidRes = await db
      .prepare(
        `INSERT INTO kitchen_movements (user_id, action, details_json, order_id, created_by, voids_movement_id, created_at)
         VALUES (?, 'void', ?, NULL, ?, ?, datetime('now'))`
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
             status = 'stewing',
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
