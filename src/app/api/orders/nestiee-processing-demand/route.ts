import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { getDataOwnerId } from '@/lib/org-server';
import { loadKitchenCatalog } from '@/lib/kitchen-catalog-server';
import { NESTIEE_ORDER_TYPE } from '@/lib/orders';
import {
  nestieeStatusesForDemandScope,
  orderMatchesNestieeDateRange,
  parseNestieeDateFilterType,
  parseNestieeDemandScope,
  summarizeNestieeProcessingDemand,
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
  const scope = parseNestieeDemandScope(url.searchParams.get('scope'));
  const dateFilterType = parseNestieeDateFilterType(url.searchParams.get('dateFilterType'));
  const statuses = [...nestieeStatusesForDemandScope(scope)];

  const ownerId = await getDataOwnerId(session);
  try {
    const statusPlaceholders = statuses.map(() => '?').join(', ');
    const clauses = [
      'user_id = ?',
      `status IN (${statusPlaceholders})`,
      `(
         order_type = ?
         OR COALESCE(fields_json::jsonb->>'order_type', '') = ?
       )`,
    ];
    const params: Array<string | number> = [ownerId, ...statuses, NESTIEE_ORDER_TYPE, NESTIEE_ORDER_TYPE];

    const rows = (await db
      .prepare(
        `SELECT status, fields_json, order_type, created_at
         FROM orders
         WHERE ${clauses.join('\n           AND ')}
         ORDER BY id DESC`
      )
      .all(...params)) as Array<{
      status: string | null;
      fields_json: string | null;
      order_type: string | null;
      created_at: string | null;
    }>;

    const orders = rows
      .map((row) => ({
        status: row.status || '',
        fields: parseFields(row.fields_json),
        created_at: row.created_at || '',
      }))
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

    const demand = summarizeNestieeProcessingDemand(
      orders,
      giftBoxTypes,
      formulas.giftBoxBoms,
      scope,
    );
    return NextResponse.json({ demand });
  } catch {
    return NextResponse.json({ error: 'Failed to load Nestiee demand' }, { status: 500 });
  }
}
