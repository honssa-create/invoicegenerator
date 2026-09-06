import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { resolveKitchenOwnerUserId, getInventorySlice } from '@/lib/kitchen-server';
import { loadKitchenCatalog } from '@/lib/kitchen-catalog-server';
import {
  computeKitchenProductionSchedule,
  demandFrom75gBottleTotals,
  stockFromFinishedRows,
} from '@/lib/kitchen-production-schedule';
import { NESTIEE_ORDER_TYPE, localDateYmd } from '@/lib/orders';
import { summarizeNestieeProcessingDemand } from '@/lib/nestiee-order-demand';

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

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const todayRaw = url.searchParams.get('today')?.trim() || '';
  const today = isYmd(todayRaw) ? todayRaw : localDateYmd();

  const ownerId = await resolveKitchenOwnerUserId();

  try {
    const rows = (await db
      .prepare(
        `SELECT status, fields_json, order_type, created_at
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
      status: string | null;
      fields_json: string | null;
      order_type: string | null;
      created_at: string | null;
    }>;

    const orders = rows.map((row) => {
      const fields = parseFields(row.fields_json);
      if (row.order_type && !fields.order_type) {
        fields.order_type = row.order_type;
      }
      return {
        status: row.status || '',
        fields,
        created_at: row.created_at || '',
      };
    });

    const { catalog, formulas } = await loadKitchenCatalog(ownerId);
    const giftBoxTypes = catalog.giftBoxTypes.map((g) => ({
      id: g.id,
      label: g.label,
      qtyKey: g.qtyKey,
      sortOrder: g.sortOrder,
      active: g.active,
    }));

    const demandRollup = summarizeNestieeProcessingDemand(
      orders,
      giftBoxTypes,
      formulas.giftBoxBoms,
      'processing',
      { today },
    );

    const inventory = await getInventorySlice(ownerId);
    const demandByFlavor = demandFrom75gBottleTotals(
      demandRollup.bottles.map((b) => ({ sku: b.sku, qty: b.qty })),
    );
    const stockByFlavor = stockFromFinishedRows(
      inventory.finished.map((f) => ({ sku: f.sku, quantity: f.quantity })),
    );

    const schedule = computeKitchenProductionSchedule(demandByFlavor, stockByFlavor, today);

    return NextResponse.json({
      schedule,
      orderCount: demandRollup.orderCount,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to load production schedule' }, { status: 500 });
  }
}
