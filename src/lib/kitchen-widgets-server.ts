import db from '@/lib/db';
import { loadKitchenCatalog } from '@/lib/kitchen-catalog-server';
import {
  getKitchenShippingBoxInventoryRows,
  getKitchenStockSnapshot,
  resolveKitchenOwnerUserId,
} from '@/lib/kitchen-server';
import {
  computeKitchenProductionSchedule,
  giftBoxSupplyByScheduleSlot,
  grossDemandFromRemainingGiftBoxes,
  netProductionScheduleInputs,
  stockFromFinishedRows,
  type ProductionScheduleSummary,
} from '@/lib/kitchen-production-schedule';
import { NESTIEE_ORDER_TYPE, localDateYmd } from '@/lib/orders';
import {
  NESTIEE_SHIPPED_STATUSES,
  orderMatchesNestieeDateRange,
  parseNestieeDateFilterType,
  summarizeNestieeUsedShippingBoxes,
  type NestieeDateFilterType,
  type NestieeUsedShippingBoxesSummary,
} from '@/lib/nestiee-order-demand';

export type KitchenWidgetsParams = {
  dateStart: string;
  dateEnd: string;
  dateFilterType: NestieeDateFilterType;
  today: string;
};

function parseFields(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
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

export type KitchenWidgetsPayload = {
  productionSchedule: {
    schedule: ProductionScheduleSummary;
    orderCount: number;
    dateStart: string;
    dateEnd: string;
    dateFilterType: NestieeDateFilterType;
  };
  usedShippingBoxes: {
    summary: NestieeUsedShippingBoxesSummary;
    shippingInventory: Array<{ boxId: string; label: string; quantity: number; needed: number }>;
  };
};

export async function loadKitchenWidgets(
  ownerId: number,
  params: KitchenWidgetsParams,
): Promise<KitchenWidgetsPayload> {
  const { dateStart, dateEnd, dateFilterType, today } = params;

  const [{ catalog, formulas }, fulfillments, stockSnapshot, shippingInventory] = await Promise.all([
    loadKitchenCatalog(ownerId),
    loadFulfillments(ownerId),
    getKitchenStockSnapshot(ownerId),
    getKitchenShippingBoxInventoryRows(ownerId),
  ]);

  const giftBoxTypes = catalog.giftBoxTypes.map((g) => ({
    id: g.id,
    label: g.label,
    qtyKey: g.qtyKey,
    sortOrder: g.sortOrder,
    active: g.active,
  }));

  const processingRows = (await db
    .prepare(
      `SELECT id, status, fields_json, order_type, created_at
       FROM orders
       WHERE user_id = ?
         AND status = ?
         AND (
           order_type = ?
           OR COALESCE(fields_json::jsonb->>'order_type', '') = ?
         )
       ORDER BY id DESC`
    )
    .all(ownerId, 'processing', NESTIEE_ORDER_TYPE, NESTIEE_ORDER_TYPE)) as Array<{
    id: number;
    status: string | null;
    fields_json: string | null;
    order_type: string | null;
    created_at: string | null;
  }>;

  const processingOrders = processingRows
    .map((row) => {
      const fields = parseFields(row.fields_json);
      if (row.order_type && !fields.order_type) fields.order_type = row.order_type;
      return {
        id: row.id,
        status: row.status || '',
        fields,
        created_at: row.created_at || '',
      };
    })
    .filter((order) => orderMatchesNestieeDateRange(order, { dateStart, dateEnd, dateFilterType }));

  const grossDemand = grossDemandFromRemainingGiftBoxes(
    processingOrders,
    giftBoxTypes,
    formulas.giftBoxBoms,
    fulfillments,
  );

  const giftBoxBottles = giftBoxSupplyByScheduleSlot(
    stockSnapshot.giftBoxes.map((g) => ({ boxType: g.boxType, quantity: g.quantity })),
    formulas.giftBoxBoms,
  );
  const looseStock = stockFromFinishedRows(
    stockSnapshot.finished.map((f) => ({ sku: f.sku, quantity: f.quantity })),
  );
  const net = netProductionScheduleInputs(grossDemand, giftBoxBottles, looseStock);
  const schedule = computeKitchenProductionSchedule(
    net.netDemand,
    net.netStock,
    today,
    net.grossDemand,
    net.giftBoxBottles,
  );

  const statuses = [...NESTIEE_SHIPPED_STATUSES];
  const statusPlaceholders = statuses.map(() => '?').join(', ');
  const shippedRows = (await db
    .prepare(
      `SELECT status, fields_json, order_type, created_at
       FROM orders
       WHERE user_id = ?
         AND status IN (${statusPlaceholders})
         AND (
           order_type = ?
           OR COALESCE(fields_json::jsonb->>'order_type', '') = ?
         )
       ORDER BY id DESC`
    )
    .all(ownerId, ...statuses, NESTIEE_ORDER_TYPE, NESTIEE_ORDER_TYPE)) as Array<{
    status: string | null;
    fields_json: string | null;
    order_type: string | null;
    created_at: string | null;
  }>;

  const shippedOrders = shippedRows.map((row) => {
    const fields = parseFields(row.fields_json);
    if (row.order_type && !fields.order_type) fields.order_type = row.order_type;
    return {
      status: row.status || '',
      fields,
      created_at: row.created_at || '',
    };
  });

  const giftBoxTypesForUsed = catalog.giftBoxTypes.map((g) => ({
    id: g.id,
    label: g.label,
    qtyKey: g.qtyKey,
    active: g.active,
  }));

  const summary = summarizeNestieeUsedShippingBoxes(shippedOrders, giftBoxTypesForUsed, {
    dateStart,
    dateEnd,
    dateFilterType,
  });

  return {
    productionSchedule: {
      schedule,
      orderCount: processingOrders.length,
      dateStart,
      dateEnd,
      dateFilterType,
    },
    usedShippingBoxes: {
      summary,
      shippingInventory,
    },
  };
}

export async function loadKitchenWidgetsForRequest(
  ownerId: number,
  searchParams: URLSearchParams,
): Promise<KitchenWidgetsPayload> {
  const dateStartRaw = searchParams.get('dateStart')?.trim() || '';
  const dateEndRaw = searchParams.get('dateEnd')?.trim() || '';
  const isYmd = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
  const dateStart = isYmd(dateStartRaw) ? dateStartRaw : '';
  const dateEnd = isYmd(dateEndRaw) ? dateEndRaw : '';
  const dateFilterType = parseNestieeDateFilterType(searchParams.get('dateFilterType'));
  const todayRaw = searchParams.get('today')?.trim() || '';
  const today = isYmd(todayRaw) ? todayRaw : localDateYmd();
  return loadKitchenWidgets(ownerId, { dateStart, dateEnd, dateFilterType, today });
}

/** Re-export for routes that only need owner id resolution at call site. */
export { resolveKitchenOwnerUserId };
