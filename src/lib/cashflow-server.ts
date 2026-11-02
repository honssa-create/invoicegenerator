import db from './db';
import { currentMonth, type CashflowResponse, type LedgerEntry } from './cashflow';
import { orderPaymentReceiptUrl, otherIncomeReceiptUrl } from './image-url';
import { clampPageLimit, clampPageOffset, yearMonthParam } from './list-query';
import { displayOrderNumber } from './record-numbering-core';

export const CASHFLOW_PAGE_SIZE = 100;
export const CASHFLOW_MAX_PAGE_SIZE = 200;

export type CashflowListQuery = {
  month: string;
  limit: number;
  offset: number;
};

const LEDGER_CTE = `
  product AS (
    SELECT
      'product'::text AS kind,
      o.id AS entity_id,
      COALESCE(NULLIF(btrim(j.fj->>'payment_date'), ''), left(COALESCE(o.created_at, ''), 10)) AS entry_date,
      'Product Sale'::text AS category,
      COALESCE(o.po_number, '') AS po_number,
      COALESCE(o.reference_number, '') AS reference_number,
      COALESCE(j.fj->>'payment_bank', '') AS account,
      btrim(j.fj->>'payment_amount')::numeric AS amount,
      COALESCE(j.fj->>'payment_receipt_path', '') AS receipt_path,
      CASE WHEN COALESCE(j.fj->>'payment_verified', '') IN ('true', '1') THEN TRUE ELSE FALSE END AS verified
    FROM orders o
    CROSS JOIN LATERAL (
      SELECT CASE
        WHEN o.fields_json IS NULL OR btrim(o.fields_json) = '' THEN '{}'::jsonb
        ELSE o.fields_json::jsonb
      END AS fj
    ) j
    WHERE o.user_id = ?
      AND (
        (NULLIF(j.fj->>'payment_date', '') IS NOT NULL AND (j.fj->>'payment_date') LIKE ?)
        OR (
          (j.fj->>'payment_date' IS NULL OR j.fj->>'payment_date' = '')
          AND COALESCE(o.created_at, '') LIKE ?
        )
      )
      AND btrim(COALESCE(j.fj->>'payment_amount', '')) ~ '^[-]{0,1}[0-9]+([.][0-9]+){0,1}$'
      AND btrim(j.fj->>'payment_amount')::numeric <> 0
  ),
  other AS (
    SELECT
      'other'::text AS kind,
      id AS entity_id,
      COALESCE(NULLIF(txn_date, ''), left(COALESCE(created_at, ''), 10)) AS entry_date,
      COALESCE(NULLIF(category, ''), '其他') AS category,
      ''::text AS po_number,
      COALESCE(remarks, '') AS reference_number,
      COALESCE(account, '') AS account,
      amount::numeric AS amount,
      COALESCE(receipt_path, '') AS receipt_path,
      (verified = 1) AS verified
    FROM other_income
    WHERE user_id = ?
      AND (
        (txn_date IS NOT NULL AND txn_date LIKE ?)
        OR (txn_date IS NULL AND COALESCE(created_at, '') LIKE ?)
      )
  ),
  rows AS (
    SELECT * FROM product
    UNION ALL
    SELECT * FROM other
  )
`;

export function parseCashflowListQuery(params: {
  month?: string | null;
  limit?: string | null;
  offset?: string | null;
}): CashflowListQuery {
  return {
    month: yearMonthParam(params.month) || currentMonth(),
    limit: clampPageLimit(params.limit, CASHFLOW_PAGE_SIZE, CASHFLOW_MAX_PAGE_SIZE),
    offset: clampPageOffset(params.offset),
  };
}

function isVerified(value: unknown): boolean {
  return value === true || value === 'true' || value === 't' || value === 1 || value === '1';
}

export async function listCashflowMonth(userId: number, query: CashflowListQuery): Promise<CashflowResponse> {
  const monthLike = `${query.month}%`;
  const rows = (await db
    .prepare(
      `WITH ${LEDGER_CTE},
       summary AS (
         SELECT
           COUNT(*)::int AS summary_total,
           COALESCE(SUM(amount) FILTER (WHERE kind = 'product'), 0) AS product_sales,
           COALESCE(SUM(amount) FILTER (WHERE kind = 'other'), 0) AS other_income
         FROM rows
       )
       SELECT
         summary.summary_total,
         summary.product_sales,
         summary.other_income,
         page.kind,
         page.entity_id,
         page.entry_date,
         page.category,
         page.po_number,
         page.reference_number,
         page.account,
         page.amount,
         page.receipt_path,
         page.verified
       FROM summary
       LEFT JOIN LATERAL (
         SELECT * FROM rows
         ORDER BY entry_date DESC NULLS LAST, kind ASC, entity_id DESC
         LIMIT ? OFFSET ?
       ) page ON TRUE`,
    )
    .all(
      userId,
      monthLike,
      monthLike,
      userId,
      monthLike,
      monthLike,
      query.limit,
      query.offset,
    )) as Array<Record<string, unknown>>;

  const first = rows[0];
  const productSales = Number(first?.product_sales) || 0;
  const otherIncome = Number(first?.other_income) || 0;
  const entries: LedgerEntry[] = [];
  for (const row of rows) {
    if (row.entity_id == null || row.kind == null) continue;
    const id = Number(row.entity_id);
    const kind = row.kind === 'other' ? 'other' : 'product';
    const receipt = String(row.receipt_path || '');
    entries.push({
      key: kind === 'product' ? `order-${id}` : `income-${id}`,
      kind,
      date: String(row.entry_date || ''),
      category: String(row.category || ''),
      ref:
        kind === 'product'
          ? displayOrderNumber(String(row.po_number || '')) || String(row.reference_number || '')
          : String(row.reference_number || ''),
      account: String(row.account || ''),
      amount: Number(row.amount) || 0,
      receiptUrl:
        kind === 'product' ? orderPaymentReceiptUrl(id, receipt) : otherIncomeReceiptUrl(id, receipt),
      verified: isVerified(row.verified),
      orderId: kind === 'product' ? id : undefined,
      incomeId: kind === 'other' ? id : undefined,
    });
  }

  return {
    month: query.month,
    totals: { productSales, otherIncome, gross: productSales + otherIncome },
    entries,
    total: Number(first?.summary_total) || 0,
    limit: query.limit,
    offset: query.offset,
  };
}
