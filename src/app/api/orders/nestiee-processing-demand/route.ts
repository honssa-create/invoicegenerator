import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { getDataOwnerId } from '@/lib/org-server';
import { readKitchenGiftBoxDemandData } from '@/lib/kitchen-catalog-server';
import { localDateYmd } from '@/lib/orders';
import {
  buildNestieeDemandListFilterSql,
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

const NESTIEE_DEMAND_FROM = `FROM orders o
       LEFT JOIN LATERAL (
         SELECT CASE
           WHEN o.fields_json IS NULL OR btrim(o.fields_json) = '' THEN '{}'::jsonb
           ELSE o.fields_json::jsonb
         END AS fj
       ) AS j ON true`;

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
  const todayRaw = url.searchParams.get('today')?.trim() || '';
  const today = isYmd(todayRaw) ? todayRaw : localDateYmd();

  const ownerId = await getDataOwnerId(session);
  try {
    const params: Array<string | number> = [ownerId];
    const whereExtra = buildNestieeDemandListFilterSql(
      scope,
      { dateStart, dateEnd, dateFilterType, today },
      params,
    );

    const [{ giftBoxTypes, giftBoxBoms }, rows] = await Promise.all([
      readKitchenGiftBoxDemandData(ownerId),
      (async () =>
        (await db
          .prepare(
            `SELECT o.status, o.fields_json, o.order_type, o.created_at
             ${NESTIEE_DEMAND_FROM}
             WHERE o.user_id = ?${whereExtra}
             ORDER BY o.id DESC`
          )
          .all(...params)) as Array<{
          status: string | null;
          fields_json: string | null;
          order_type: string | null;
          created_at: string | null;
        }>)(),
    ]);

    const orders = rows.map((row) => ({
      status: row.status || '',
      fields: parseFields(row.fields_json),
      created_at: row.created_at || '',
    }));

    const demand = summarizeNestieeProcessingDemand(
      orders,
      giftBoxTypes,
      giftBoxBoms,
      scope,
      { today },
    );
    return NextResponse.json({ demand });
  } catch {
    return NextResponse.json({ error: 'Failed to load Nestiee demand' }, { status: 500 });
  }
}
