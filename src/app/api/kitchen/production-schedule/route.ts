import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { resolveKitchenOwnerUserId, getInventorySlice } from '@/lib/kitchen-server';
import { loadKitchenCatalog } from '@/lib/kitchen-catalog-server';
import {
  computeKitchenProductionSchedule,
  giftBoxSupplyByScheduleSlot,
  grossDemandFromRemainingGiftBoxes,
  netProductionScheduleInputs,
  stockFromFinishedRows,
} from '@/lib/kitchen-production-schedule';
import { NESTIEE_ORDER_TYPE, localDateYmd } from '@/lib/orders';
import {
  orderMatchesNestieeDateRange,
  parseNestieeDateFilterType,
} from '@/lib/nestiee-order-demand';

function parseFields(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function isYmd(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
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

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const dateStartRaw = url.searchParams.get('dateStart')?.trim() || '';
  const dateEndRaw = url.searchParams.get('dateEnd')?.trim() || '';
  const dateStart = isYmd(dateStartRaw) ? dateStartRaw : '';
  const dateEnd = isYmd(dateEndRaw) ? dateEndRaw : '';
  const dateFilterType = parseNestieeDateFilterType(url.searchParams.get('dateFilterType'));
  const todayRaw = url.searchParams.get('today')?.trim() || '';
  const today = isYmd(todayRaw) ? todayRaw : localDateYmd();

  const ownerId = await resolveKitchenOwnerUserId();

  try {
    const rows = (await db
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

    const orders = rows
      .map((row) => {
        const fields = parseFields(row.fields_json);
        if (row.order_type && !fields.order_type) {
          fields.order_type = row.order_type;
        }
        return {
          id: row.id,
          status: row.status || '',
          fields,
          created_at: row.created_at || '',
        };
      })
      .filter((order) =>
        orderMatchesNestieeDateRange(order, { dateStart, dateEnd, dateFilterType }),
      );

    const { catalog, formulas } = await loadKitchenCatalog(ownerId);
    const giftBoxTypes = catalog.giftBoxTypes.map((g) => ({
      id: g.id,
      label: g.label,
      qtyKey: g.qtyKey,
      sortOrder: g.sortOrder,
      active: g.active,
    }));

    const fulfillments = await loadFulfillments(ownerId);
    const grossDemand = grossDemandFromRemainingGiftBoxes(
      orders,
      giftBoxTypes,
      formulas.giftBoxBoms,
      fulfillments,
    );

    const inventory = await getInventorySlice(ownerId);
    const giftBoxBottles = giftBoxSupplyByScheduleSlot(
      inventory.giftBoxes.map((g) => ({ boxType: g.boxType, quantity: g.quantity })),
      formulas.giftBoxBoms,
    );
    const looseStock = stockFromFinishedRows(
      inventory.finished.map((f) => ({ sku: f.sku, quantity: f.quantity })),
    );

    const net = netProductionScheduleInputs(grossDemand, giftBoxBottles, looseStock);
    const schedule = computeKitchenProductionSchedule(
      net.netDemand,
      net.netStock,
      today,
      net.grossDemand,
      net.giftBoxBottles,
    );

    return NextResponse.json({
      schedule,
      grossDemand: net.grossDemand,
      giftBoxBottles: net.giftBoxBottles,
      looseStock: net.looseStock,
      orderCount: orders.length,
      dateStart,
      dateEnd,
      dateFilterType,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to load production schedule' }, { status: 500 });
  }
}
