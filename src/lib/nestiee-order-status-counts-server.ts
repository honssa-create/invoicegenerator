import db from './db';
import { NESTIEE_ORDER_TYPE, localDateYmd } from './orders';
import {
  NESTIEE_PROCESSING_STATUS,
  NESTIEE_SHIPPED_STATUSES,
  NESTIEE_STATUS_SHIP_WITHIN_DAYS,
  nestieeShipWithinDaysDateRange,
  parseNestieeDateFilterType,
  type NestieeDateFilterType,
  type NestieeOrderStatusCounts,
} from './nestiee-order-demand';
import { buildOrderDeliveryDateExpr } from './order-list-shipped-sql';

const FROM = `FROM orders o
       LEFT JOIN LATERAL (
         SELECT CASE
           WHEN o.fields_json IS NULL OR btrim(o.fields_json) = '' THEN '{}'::jsonb
           ELSE o.fields_json::jsonb
         END AS fj
       ) AS j ON true`;

function appendNestieeDateRangeSql(
  opts: { dateStart?: string; dateEnd?: string; dateFilterType?: NestieeDateFilterType },
  params: (string | number)[],
): string {
  const dateStart = opts.dateStart || '';
  const dateEnd = opts.dateEnd || '';
  if (!dateStart && !dateEnd) return 'TRUE';

  const dateFilterType = parseNestieeDateFilterType(opts.dateFilterType);
  if (dateFilterType === 'delivery_date') {
    const dueExpr = buildOrderDeliveryDateExpr();
    let clause = `${dueExpr} <> ''`;
    if (dateStart) {
      clause += ` AND ${dueExpr} >= ?`;
      params.push(dateStart);
    }
    if (dateEnd) {
      clause += ` AND ${dueExpr} <= ?`;
      params.push(dateEnd);
    }
    return clause;
  }

  const createdExpr = `COALESCE(NULLIF(TRIM(LEFT(o.created_at, 10)), ''), '')`;
  if (dateStart && dateEnd) {
    params.push(dateStart, dateEnd);
    return `(${createdExpr} = '' OR (${createdExpr} >= ? AND ${createdExpr} <= ?))`;
  }
  if (dateStart) {
    params.push(dateStart);
    return `(${createdExpr} = '' OR ${createdExpr} >= ?)`;
  }
  params.push(dateEnd);
  return `(${createdExpr} = '' OR ${createdExpr} <= ?)`;
}

export async function countNestieeOrderStatusCounts(
  userId: number,
  opts: {
    dateStart?: string;
    dateEnd?: string;
    dateFilterType?: NestieeDateFilterType;
    today?: string;
  } = {},
): Promise<NestieeOrderStatusCounts> {
  const today = opts.today || localDateYmd();
  const { dateStart: shipStart, dateEnd: shipEnd } = nestieeShipWithinDaysDateRange(
    today,
    NESTIEE_STATUS_SHIP_WITHIN_DAYS,
  );
  const dueExpr = buildOrderDeliveryDateExpr();

  const baseParams: (string | number)[] = [userId, NESTIEE_ORDER_TYPE, NESTIEE_ORDER_TYPE];
  const dateParams: (string | number)[] = [];
  const dateRange = appendNestieeDateRangeSql(opts, dateParams);

  const shippedList = NESTIEE_SHIPPED_STATUSES.map((s) => `'${s.replace(/'/g, "''")}'`).join(', ');

  const row = (await db
    .prepare(
      `SELECT
         COUNT(*) FILTER (
           WHERE COALESCE(o.status, '') = '${NESTIEE_PROCESSING_STATUS}' AND (${dateRange})
         )::int AS processing,
         COUNT(*) FILTER (
           WHERE COALESCE(o.status, '') IN (${shippedList}) AND (${dateRange})
         )::int AS completed,
         COUNT(*) FILTER (
           WHERE COALESCE(o.status, '') = '${NESTIEE_PROCESSING_STATUS}'
             AND ${dueExpr} <> ''
             AND ${dueExpr} >= ?
             AND ${dueExpr} <= ?
         )::int AS ship_within_days
       ${FROM}
       WHERE o.user_id = ?
         AND (
           COALESCE(o.order_type, '') = ?
           OR COALESCE(j.fj->>'order_type', '') = ?
         )`
    )
    .get(...dateParams, ...dateParams, shipStart, shipEnd, ...baseParams)) as
    | { processing: number; completed: number; ship_within_days: number }
    | undefined;

  return {
    processing: Number(row?.processing) || 0,
    completed: Number(row?.completed) || 0,
    shipWithinDays: Number(row?.ship_within_days) || 0,
  };
}
