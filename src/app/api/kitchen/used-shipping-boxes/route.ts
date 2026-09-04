import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { resolveKitchenOwnerUserId, getInventorySlice } from '@/lib/kitchen-server';
import { loadKitchenCatalog } from '@/lib/kitchen-catalog-server';
import { NESTIEE_ORDER_TYPE } from '@/lib/orders';
import {
  NESTIEE_SHIPPED_STATUSES,
  parseNestieeDateFilterType,
  summarizeNestieeUsedShippingBoxes,
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

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const dateStartRaw = url.searchParams.get('dateStart')?.trim() || '';
  const dateEndRaw = url.searchParams.get('dateEnd')?.trim() || '';
  const dateStart = isYmd(dateStartRaw) ? dateStartRaw : '';
  const dateEnd = isYmd(dateEndRaw) ? dateEndRaw : '';
  const dateFilterType = parseNestieeDateFilterType(url.searchParams.get('dateFilterType'));

  const ownerId = await resolveKitchenOwnerUserId();
  const statuses = [...NESTIEE_SHIPPED_STATUSES];

  try {
    const statusPlaceholders = statuses.map(() => '?').join(', ');
    const rows = (await db
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

    const { catalog } = await loadKitchenCatalog(ownerId);
    const giftBoxTypes = catalog.giftBoxTypes.map((g) => ({
      id: g.id,
      label: g.label,
      qtyKey: g.qtyKey,
      active: g.active,
    }));

    const summary = summarizeNestieeUsedShippingBoxes(orders, giftBoxTypes, {
      dateStart,
      dateEnd,
      dateFilterType,
    });

    const inventory = await getInventorySlice(ownerId);

    return NextResponse.json({
      summary,
      shippingInventory: inventory.shippingBoxes.map((b) => ({
        boxId: b.boxId,
        label: b.label,
        quantity: b.quantity,
        needed: b.needed,
      })),
    });
  } catch {
    return NextResponse.json({ error: 'Failed to load used shipping boxes' }, { status: 500 });
  }
}
