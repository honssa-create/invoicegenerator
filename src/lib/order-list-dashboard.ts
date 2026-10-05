import db from './db';
import { localDateYmd, type OrderDashboardCounts } from './orders';
import { addCalendarDays } from './wedding-gift-confirmation';
import {
  buildOrderListFilterSql,
  orderListQueryForDashboardCards,
  type OrderListQuery,
} from './order-list-filters';
import { buildOrderDueDateSql, buildOrderIsShippedSql } from './order-list-shipped-sql';

export { buildOrderDueDateSql, buildOrderIsShippedSql } from './order-list-shipped-sql';

const ORDER_LIST_FROM = `FROM orders o
       LEFT JOIN LATERAL (
         SELECT CASE
           WHEN o.fields_json IS NULL OR btrim(o.fields_json) = '' THEN '{}'::jsonb
           ELSE o.fields_json::jsonb
         END AS fj
       ) AS j ON true`;

export async function countOrderListDashboard(
  userId: number,
  listQuery: OrderListQuery,
  opts?: { today?: string; withinDays?: number },
): Promise<OrderDashboardCounts> {
  const params: (string | number)[] = [userId];
  const whereExtra = buildOrderListFilterSql(orderListQueryForDashboardCards(listQuery), params);
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
