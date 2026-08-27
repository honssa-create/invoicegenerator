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

  const ownerId = await getDataOwnerId(session);
  try {
    const clauses = [
      'user_id = ?',
      `status = 'processing'`,
      `(
         order_type = ?
         OR COALESCE(fields_json::jsonb->>'order_type', '') = ?
       )`,
    ];
    const params: Array<string | number> = [ownerId, NESTIEE_ORDER_TYPE, NESTIEE_ORDER_TYPE];

    // Match orders list FilterBar: compare created_at date portion (YYYY-MM-DD).
    // Empty created_at is kept (same as client list filter).
    if (dateStart) {
      clauses.push(
        `(COALESCE(LEFT(created_at, 10), '') = '' OR LEFT(created_at, 10) >= ?)`
      );
      params.push(dateStart);
    }
    if (dateEnd) {
      clauses.push(
        `(COALESCE(LEFT(created_at, 10), '') = '' OR LEFT(created_at, 10) <= ?)`
      );
      params.push(dateEnd);
    }

    const rows = (await db
      .prepare(
        `SELECT status, fields_json, order_type
         FROM orders
         WHERE ${clauses.join('\n           AND ')}
         ORDER BY id DESC`
      )
      .all(...params)) as Array<{
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
