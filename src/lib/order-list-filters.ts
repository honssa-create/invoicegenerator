import {
  BADGE_ORDER_TYPES,
  NESTIEE_ORDER_TYPE,
  WEDDING_GIFT_ORDER_TYPE,
  localDateYmd,
} from './orders';
import { parseNestieeDateFilterType, type NestieeDateFilterType } from './nestiee-order-demand';

export type OrderListQuery = {
  orderType?: string;
  status?: string;
  dateStart?: string;
  dateEnd?: string;
  /** When true, date range uses Nestiee order/delivery rules. */
  nestieeDates?: boolean;
  dateFilterType?: NestieeDateFilterType;
  search?: string;
};

export type OrderListPagination = {
  limit: number;
  offset: number;
};

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function parseOrderListQuery(searchParams: URLSearchParams): OrderListQuery & OrderListPagination {
  const orderType = searchParams.get('orderType')?.trim() || searchParams.get('type')?.trim() || '';
  const status = searchParams.get('status')?.trim() || '';
  const dateStartRaw = searchParams.get('dateStart')?.trim() || '';
  const dateEndRaw = searchParams.get('dateEnd')?.trim() || '';
  const dateStart = YMD.test(dateStartRaw) ? dateStartRaw : '';
  const dateEnd = YMD.test(dateEndRaw) ? dateEndRaw : '';
  const nestieeDates = searchParams.get('nestieeDates') === '1';
  const dateFilterType = parseNestieeDateFilterType(searchParams.get('dateFilterType'));
  const search = searchParams.get('search')?.trim() || '';
  const limitRaw = Number(searchParams.get('limit'));
  const offsetRaw = Number(searchParams.get('offset'));
  const all = searchParams.get('all') === '1';
  const limit = all
    ? 5000
    : Math.min(5000, Math.max(1, Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 200));
  const offset = Math.max(0, Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0);
  return {
    orderType,
    status,
    dateStart,
    dateEnd,
    nestieeDates,
    dateFilterType,
    search,
    limit,
    offset,
  };
}

/** SQL fragments appended after `WHERE o.user_id = ?`. */
export function buildOrderListFilterSql(
  query: OrderListQuery,
  params: (string | number)[],
): string {
  let where = '';

  const ot = query.orderType || '';
  if (ot === 'honour') {
    const types = [...BADGE_ORDER_TYPES];
    const ph = types.map(() => '?').join(', ');
    where += ` AND (
      COALESCE(o.order_type, '') IN (${ph})
      OR COALESCE(j.fj->>'order_type', '') IN (${ph})
    )`;
    params.push(...types, ...types);
  } else if (ot === 'wedding') {
    where += ` AND (
      COALESCE(o.order_type, '') = ?
      OR COALESCE(j.fj->>'order_type', '') = ?
    )`;
    params.push(WEDDING_GIFT_ORDER_TYPE, WEDDING_GIFT_ORDER_TYPE);
  } else if (ot === 'nestiee') {
    where += ` AND (
      COALESCE(o.order_type, '') = ?
      OR COALESCE(j.fj->>'order_type', '') = ?
    )`;
    params.push(NESTIEE_ORDER_TYPE, NESTIEE_ORDER_TYPE);
  } else if (ot) {
    where += ` AND (
      COALESCE(o.order_type, '') = ?
      OR COALESCE(j.fj->>'order_type', '') = ?
    )`;
    params.push(ot, ot);
  }

  if (query.status) {
    where += ` AND COALESCE(o.status, '') = ?`;
    params.push(query.status);
  }

  const dateStart = query.dateStart || '';
  const dateEnd = query.dateEnd || '';
  if (dateStart || dateEnd) {
    if (query.nestieeDates && parseNestieeDateFilterType(query.dateFilterType) === 'delivery_date') {
      const dueExpr = `COALESCE(
        NULLIF(TRIM(j.fj->>'client_delivery_date'), ''),
        NULLIF(TRIM(j.fj->>'due_date'), ''),
        NULLIF(TRIM(o.delivery_date), ''),
        ''
      )`;
      where += ` AND ${dueExpr} <> ''`;
      if (dateStart) {
        where += ` AND ${dueExpr} >= ?`;
        params.push(dateStart);
      }
      if (dateEnd) {
        where += ` AND ${dueExpr} <= ?`;
        params.push(dateEnd);
      }
    } else {
      const createdExpr = `COALESCE(NULLIF(TRIM(LEFT(o.created_at, 10)), ''), '')`;
      if (dateStart) {
        where += ` AND (${createdExpr} = '' OR ${createdExpr} >= ?)`;
        params.push(dateStart);
      }
      if (dateEnd) {
        where += ` AND (${createdExpr} = '' OR ${createdExpr} <= ?)`;
        params.push(dateEnd);
      }
    }
  }

  const q = (query.search || '').trim();
  if (q) {
    const like = `%${q.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
    where += ` AND (
      o.reference_number ILIKE ? ESCAPE '\\'
      OR COALESCE(o.po_number, '') ILIKE ? ESCAPE '\\'
      OR COALESCE(o.name, '') ILIKE ? ESCAPE '\\'
      OR COALESCE(o.description, '') ILIKE ? ESCAPE '\\'
    )`;
    params.push(like, like, like, like);
  }

  return where;
}

export function defaultOrderListLimitForView(view: 'line' | 'board' | 'calendar'): number {
  if (view === 'line') return 50;
  return 2500;
}

export { localDateYmd };
