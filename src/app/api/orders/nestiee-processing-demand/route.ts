import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { getDataOwnerId } from '@/lib/org-server';
import { loadKitchenCatalog } from '@/lib/kitchen-catalog-server';
import { NESTIEE_ORDER_TYPE } from '@/lib/orders';
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

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ownerId = await getDataOwnerId(session);
  try {
    const rows = (await db
      .prepare(
        `SELECT status, fields_json, order_type
         FROM orders
         WHERE user_id = ?
           AND status = 'processing'
           AND (
             order_type = ?
             OR COALESCE(fields_json::jsonb->>'order_type', '') = ?
           )
         ORDER BY id DESC`
      )
      .all(ownerId, NESTIEE_ORDER_TYPE, NESTIEE_ORDER_TYPE)) as Array<{
      status: string | null;
      fields_json: string | null;
      order_type: string | null;
    }>;

    const orders = rows.map((row) => ({
      status: row.status || '',
      fields: parseFields(row.fields_json),
    }));

    const { catalog, formulas } = await loadKitchenCatalog(ownerId);
    const giftBoxTypes = catalog.giftBoxTypes.map((g) => ({
      id: g.id,
      label: g.label,
      qtyKey: g.qtyKey,
      sortOrder: g.sortOrder,
      active: g.active,
    }));

    const demand = summarizeNestieeProcessingDemand(orders, giftBoxTypes, formulas.giftBoxBoms);
    return NextResponse.json({ demand });
  } catch {
    return NextResponse.json({ error: 'Failed to load Nestiee demand' }, { status: 500 });
  }
}
