import db from './db';
import {
  CUPMOKA_ORDER_TYPE,
  NESTIEE_ORDER_TYPE,
  WEDDING_GIFT_ORDER_TYPE,
  WEDDING_GIFT_SHIPPED_STATUSES,
  localDateYmd,
  type OrderDashboardCounts,
} from './orders';
import { addCalendarDays } from './wedding-gift-confirmation';
import { buildOrderListFilterSql, type OrderListQuery } from './order-list-filters';

const ORDER_LIST_FROM = `FROM orders o
       LEFT JOIN LATERAL (
         SELECT CASE
           WHEN o.fields_json IS NULL OR btrim(o.fields_json) = '' THEN '{}'::jsonb
           ELSE o.fields_json::jsonb
         END AS fj
       ) AS j ON true`;

function sqlQuote(value: string): string {
  return value.replace(/'/g, "''");
}

/** Matches {@link orderDueDate} for field-backed dates (not nestiee_lines). */
export function buildOrderDueDateSql(): string {
  return `COALESCE(
    NULLIF(TRIM(LEFT(j.fj->>'due_date', 10)), ''),
    NULLIF(TRIM(LEFT(j.fj->>'client_delivery_date', 10)), ''),
    NULLIF(TRIM(LEFT(o.delivery_date, 10)), ''),
    ''
  )`;
}

/** Matches {@link isOrderShipped} for status + order_type. */
export function buildOrderIsShippedSql(): string {
  const ot = `COALESCE(NULLIF(TRIM(j.fj->>'order_type'), ''), NULLIF(TRIM(o.order_type), ''), '')`;
  const weddingList = WEDDING_GIFT_SHIPPED_STATUSES.map((s) => `'${sqlQuote(s)}'`).join(', ');
  const wedding = sqlQuote(WEDDING_GIFT_ORDER_TYPE);
  const nestiee = sqlQuote(NESTIEE_ORDER_TYPE);
  const cupmoka = sqlQuote(CUPMOKA_ORDER_TYPE);
  return `(
    (${ot} = '${cupmoka}' AND COALESCE(o.status, '') IN ('Shipped', 'Delivered'))
    OR (${ot} = '${wedding}' AND COALESCE(o.status, '') IN (${weddingList}))
    OR (${ot} = '${nestiee}' AND COALESCE(o.status, '') IN ('shipped', 'completed'))
    OR (
      ${ot} NOT IN ('${cupmoka}', '${wedding}', '${nestiee}')
      AND (
        COALESCE(o.status, '') = '已寄出 SENT'
        OR COALESCE(o.status, '') ~* '\\ySENT\\y'
      )
    )
  )`;
}

export async function countOrderListDashboard(
  userId: number,
  listQuery: OrderListQuery,
  opts?: { today?: string; withinDays?: number },
): Promise<OrderDashboardCounts> {
  const params: (string | number)[] = [userId];
  const whereExtra = buildOrderListFilterSql(listQuery, params);
  const shipped = buildOrderIsShippedSql();
  const due = buildOrderDueDateSql();
  const today = opts?.today || localDateYmd();
  const within = opts?.withinDays ?? 2;
  const urgentLimit = addCalendarDays(today, within);
  params.push(urgentLimit);

  const row = (await db
    .prepare(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE NOT (${shipped}))::int AS unshipped,
         COUNT(*) FILTER (WHERE NOT (${shipped}) AND ${due} <> '' AND ${due} <= ?)::int AS urgent
       ${ORDER_LIST_FROM}
       WHERE o.user_id = ?${whereExtra}`
    )
    .get(...params)) as { total: number; unshipped: number; urgent: number } | undefined;

  return {
    total: Number(row?.total) || 0,
    unshipped: Number(row?.unshipped) || 0,
    urgent: Number(row?.urgent) || 0,
  };
}
