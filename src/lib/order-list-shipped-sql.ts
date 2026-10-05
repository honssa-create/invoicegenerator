import {
  CUPMOKA_ORDER_TYPE,
  NESTIEE_ORDER_TYPE,
  WEDDING_GIFT_ORDER_TYPE,
  WEDDING_GIFT_SHIPPED_STATUSES,
} from './orders';

function sqlQuote(value: string): string {
  return value.replace(/'/g, "''");
}

/** Nestiee delivery window (client_delivery_date → due_date → column). */
export function buildOrderDeliveryDateExpr(): string {
  return `COALESCE(
    NULLIF(TRIM(j.fj->>'client_delivery_date'), ''),
    NULLIF(TRIM(j.fj->>'due_date'), ''),
    NULLIF(TRIM(o.delivery_date), ''),
    ''
  )`;
}

/** Matches {@link orderDueDate} for field-backed dates (requires lateral `j`). */
export function buildOrderDueDateSql(): string {
  return `COALESCE(
    NULLIF(TRIM(LEFT(j.fj->>'due_date', 10)), ''),
    NULLIF(TRIM(LEFT(j.fj->>'client_delivery_date', 10)), ''),
    NULLIF(TRIM(LEFT(o.delivery_date, 10)), ''),
    ''
  )`;
}

/** Matches {@link isOrderShipped} for status + order_type (requires lateral `j`). */
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
