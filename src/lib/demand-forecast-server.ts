import db from './db';
import {
  DEFAULT_DAILY_75G_CAPACITY,
  NESTIEE_PROCESSING_STATUS,
  NESTIEE_SHIPPED_STATUSES,
  NESTIEE_SHIPPING_BOX_SLOTS,
  PRODUCTION_SCHEDULE_75G_PRODUCTS,
  addCalendarDays,
  giftCountForOrderShippingBoxes,
  isNestieeOrderType,
  localDateYmd,
  mapShippingBoxesForGiftCount,
  orderMatchesDateRange,
  orderTypeFromFields,
  parseDemandForecastDateFilterType,
  totalGiftBoxesInOrder,
  type DemandForecastDateFilterType,
  type NestieeShippingBoxId,
  type ProductionScheduleRow,
  type ShippingBoxesForecastData,
} from './demand-forecast';

export interface DemandForecastOrderRow {
  status: string;
  fields: Record<string, unknown>;
  created_at: string;
  delivery_date: string;
  order_type: string;
}

function parseFields(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function loadNestieeOrders(userId: number): DemandForecastOrderRow[] {
  const rows = db
    .prepare(
      `SELECT status, fields_json, order_type, created_at, delivery_date
       FROM orders
       WHERE user_id = ?
       ORDER BY id DESC`,
    )
    .all(userId) as Array<{
    status: string | null;
    fields_json: string | null;
    order_type: string | null;
    created_at: string | null;
    delivery_date: string | null;
  }>;

  return rows
    .map((row) => {
      const fields = parseFields(row.fields_json);
      if (row.order_type && !fields.order_type) {
        fields.order_type = row.order_type;
      }
      const orderType = orderTypeFromFields(fields) || String(row.order_type || '');
      return {
        status: row.status || '',
        fields,
        created_at: row.created_at || '',
        delivery_date: row.delivery_date || '',
        order_type: orderType,
      };
    })
    .filter((o) => isNestieeOrderType(o.order_type));
}

function loadFinishedStock(userId: number): Record<string, number> {
  const rows = db
    .prepare('SELECT sku, quantity FROM kitchen_finished WHERE user_id = ?')
    .all(userId) as Array<{ sku: string; quantity: number }>;
  const map: Record<string, number> = {};
  for (const row of rows) map[row.sku] = Number(row.quantity) || 0;
  return map;
}

function loadShippingBoxStock(userId: number): Record<NestieeShippingBoxId, number> {
  const map: Record<NestieeShippingBoxId, number> = {
    small: 0,
    single: 0,
    double: 0,
    triple: 0,
  };
  try {
    const rows = db
      .prepare('SELECT box_id, quantity FROM kitchen_shipping_boxes WHERE user_id = ?')
      .all(userId) as Array<{ box_id: string; quantity: number }>;
    for (const row of rows) {
      const id = row.box_id as NestieeShippingBoxId;
      if (map[id] !== undefined) map[id] = Number(row.quantity) || 0;
    }
  } catch {
    /* table may not exist yet on older DBs */
  }
  return map;
}

/** Simplified 75g demand: sum gift-box qty fields on processing orders (1 box ≈ 1 bottle proxy). */
function estimate75gDemandByProduct(
  orders: DemandForecastOrderRow[],
  dateFilter: { dateStart?: string; dateEnd?: string; dateFilterType?: DemandForecastDateFilterType },
): Record<string, number> {
  const demand: Record<string, number> = {};
  for (const p of PRODUCTION_SCHEDULE_75G_PRODUCTS) demand[p.id] = 0;

  for (const order of orders) {
    if (order.status !== NESTIEE_PROCESSING_STATUS) continue;
    if (!orderMatchesDateRange(order, dateFilter)) continue;

    const fields = order.fields;
    const osmanthus = Number(fields.nestiee_gift_qty_pink_osmanthus) || 0;
    const redDate = Number(fields.nestiee_gift_qty_pink_red_date) || 0;
    let rockSugar = 0;
    for (const key of [
      'nestiee_gift_qty_star_gold',
      'nestiee_gift_qty_star_silver',
      'nestiee_gift_qty_red_gold',
      'nestiee_gift_qty_red_silver',
      'nestiee_gift_qty_sui_xin_7',
      'nestiee_gift_qty_sui_xin_14',
      'nestiee_gift_qty_sui_xin_18',
      'nestiee_gift_qty_qiu_yan_fei_yue',
      'nestiee_gift_qty_rou_run_share_box',
      'nestiee_gift_qty_trial_set',
      'nestiee_gift_qty_hua_yue',
    ]) {
      const v = Number(fields[key]);
      if (Number.isFinite(v) && v > 0) rockSugar += Math.floor(v);
    }

    demand.osmanthus += Math.max(0, Math.floor(osmanthus));
    demand.red_date += Math.max(0, Math.floor(redDate));
    demand.rock_sugar += Math.max(0, Math.floor(rockSugar));
  }

  return demand;
}

export function buildProductionSchedule(
  userId: number,
  opts: {
    dateStart?: string;
    dateEnd?: string;
    dateFilterType?: DemandForecastDateFilterType;
    dailyCapacity?: number;
    today?: string;
  } = {},
): { rows: ProductionScheduleRow[]; orderCount: number } {
  const orders = loadNestieeOrders(userId);
  const dateFilter = {
    dateStart: opts.dateStart,
    dateEnd: opts.dateEnd,
    dateFilterType: parseDemandForecastDateFilterType(opts.dateFilterType),
  };
  const processing = orders.filter(
    (o) => o.status === NESTIEE_PROCESSING_STATUS && orderMatchesDateRange(o, dateFilter),
  );
  const stockMap = loadFinishedStock(userId);
  const demandMap = estimate75gDemandByProduct(orders, dateFilter);
  const dailyCapacity = Math.max(1, opts.dailyCapacity ?? DEFAULT_DAILY_75G_CAPACITY);
  const today = opts.today || localDateYmd();

  const rows: ProductionScheduleRow[] = PRODUCTION_SCHEDULE_75G_PRODUCTS.map((p) => {
    const stock = stockMap[p.sku] ?? 0;
    const demand = demandMap[p.id] ?? 0;
    const shortfall = Math.max(0, demand - stock);
    const daysNeeded = shortfall > 0 ? Math.ceil(shortfall / dailyCapacity) : 0;
    const estimatedDate = shortfall > 0 ? addCalendarDays(today, daysNeeded) : null;
    return {
      product: p.label,
      productId: p.id,
      stock,
      demand,
      shortfall,
      daysNeeded: shortfall > 0 ? daysNeeded : null,
      estimatedDate,
    };
  });

  return { rows, orderCount: processing.length };
}

export function buildShippingBoxesForecast(
  userId: number,
  opts: {
    dateStart?: string;
    dateEnd?: string;
    dateFilterType?: DemandForecastDateFilterType;
  } = {},
): ShippingBoxesForecastData {
  const orders = loadNestieeOrders(userId);
  const dateFilter = {
    dateStart: opts.dateStart,
    dateEnd: opts.dateEnd,
    dateFilterType: parseDemandForecastDateFilterType(opts.dateFilterType),
  };

  const needTotals: Record<NestieeShippingBoxId, number> = {
    small: 0,
    single: 0,
    double: 0,
    triple: 0,
  };
  const usedTotals: Record<NestieeShippingBoxId, number> = {
    small: 0,
    single: 0,
    double: 0,
    triple: 0,
  };

  let orderCountNeed = 0;
  let orderCountUsed = 0;

  for (const order of orders) {
    const giftTotal = totalGiftBoxesInOrder(order.fields);
    const giftCount = giftCountForOrderShippingBoxes(giftTotal);
    const boxes = mapShippingBoxesForGiftCount(giftCount);

    if (order.status === NESTIEE_PROCESSING_STATUS) {
      orderCountNeed += 1;
      for (const id of Object.keys(boxes) as NestieeShippingBoxId[]) {
        needTotals[id] += boxes[id];
      }
    }

    if (NESTIEE_SHIPPED_STATUSES.includes(order.status as 'shipped' | 'completed')) {
      if (!orderMatchesDateRange(order, dateFilter)) continue;
      orderCountUsed += 1;
      for (const id of Object.keys(boxes) as NestieeShippingBoxId[]) {
        usedTotals[id] += boxes[id];
      }
    }
  }

  const stockMap = loadShippingBoxStock(userId);

  const rows = NESTIEE_SHIPPING_BOX_SLOTS.map((slot) => ({
    id: slot.id,
    label: slot.label,
    stock: stockMap[slot.id] ?? 0,
    need: needTotals[slot.id] ?? 0,
    used: usedTotals[slot.id] ?? 0,
  }));

  return { rows, orderCountNeed, orderCountUsed };
}
