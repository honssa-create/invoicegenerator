import db from './db';
import { clampPageLimit, clampPageOffset, yearMonthParam } from './list-query';
import { orderTitle, type AccountingPaymentEntry, type PaymentSlot } from './orders';

export const ACCOUNTING_PAGE_SIZE = 50;
export const ACCOUNTING_MAX_PAGE_SIZE = 200;

export type AccountingSummary = {
  total: number;
  verified: number;
  pending: number;
};

export type AccountingListQuery = {
  /** `YYYY-MM`. Empty means every month. */
  month: string;
  pendingOnly: boolean;
  limit: number;
  offset: number;
};

export type AccountingListResult = {
  entries: AccountingPaymentEntry[];
  total: number;
  limit: number;
  offset: number;
  month: string;
  summary: AccountingSummary;
};

const SLOT_VALUES = `
  (1, '第一期', j.fj->>'payment_date', j.fj->>'payment_amount', j.fj->>'payment_bank', j.fj->>'payment_method_detail', j.fj->>'payment_reference', j.fj->>'payment_receipt_path', j.fj->>'payment_verified'),
  (2, '第二期', j.fj->>'payment2_date', j.fj->>'payment2_amount', j.fj->>'payment2_bank', j.fj->>'payment2_method_detail', j.fj->>'payment2_reference', j.fj->>'payment2_receipt_path', j.fj->>'payment2_verified'),
  (3, '第三期', j.fj->>'payment3_date', j.fj->>'payment3_amount', j.fj->>'payment3_bank', j.fj->>'payment3_method_detail', j.fj->>'payment3_reference', j.fj->>'payment3_receipt_path', j.fj->>'payment3_verified')
`;

const SLOTS_CTE = `
  slots AS (
    SELECT
      o.id AS order_id,
      o.reference_number,
      COALESCE(o.po_number, '') AS po_number,
      COALESCE(o.name, '') AS customer,
      COALESCE(o.description, '') AS description,
      COALESCE(o.order_type, '') AS order_type,
      s.slot,
      s.installment_label,
      COALESCE(s.payment_date, '') AS payment_date,
      COALESCE(s.amount, '') AS amount,
      COALESCE(s.bank, '') AS bank,
      COALESCE(s.method, '') AS method,
      COALESCE(s.reference, '') AS reference,
      COALESCE(s.receipt, '') AS receipt,
      COALESCE(s.verified, '') AS verified,
      COALESCE(NULLIF(btrim(s.payment_date), ''), left(COALESCE(o.created_at, ''), 10)) AS effective_date
    FROM orders o
    CROSS JOIN LATERAL (
      SELECT CASE
        WHEN o.fields_json IS NULL OR btrim(o.fields_json) = '' THEN '{}'::jsonb
        ELSE o.fields_json::jsonb
      END AS fj
    ) j
    CROSS JOIN LATERAL (
      VALUES ${SLOT_VALUES}
    ) AS s(slot, installment_label, payment_date, amount, bank, method, reference, receipt, verified)
    WHERE o.user_id = ?
      AND (
        NULLIF(btrim(COALESCE(s.payment_date, '')), '') IS NOT NULL
        OR NULLIF(btrim(COALESCE(s.amount, '')), '') IS NOT NULL
        OR NULLIF(btrim(COALESCE(s.bank, '')), '') IS NOT NULL
        OR NULLIF(btrim(COALESCE(s.method, '')), '') IS NOT NULL
        OR NULLIF(btrim(COALESCE(s.reference, '')), '') IS NOT NULL
        OR NULLIF(btrim(COALESCE(s.receipt, '')), '') IS NOT NULL
      )
  )
`;

export function parseAccountingListQuery(params: {
  month?: string | null;
  pending?: string | null;
  limit?: string | null;
  offset?: string | null;
}): AccountingListQuery {
  const monthRaw = (params.month || '').trim();
  return {
    month: monthRaw === 'all' ? '' : yearMonthParam(monthRaw),
    pendingOnly: params.pending === '1' || params.pending === 'true',
    limit: clampPageLimit(params.limit, ACCOUNTING_PAGE_SIZE, ACCOUNTING_MAX_PAGE_SIZE),
    offset: clampPageOffset(params.offset),
  };
}

function isVerified(value: string): boolean {
  return value === 'true' || value === '1';
}

export async function listAccountingEntries(
  userId: number,
  query: AccountingListQuery,
): Promise<AccountingListResult> {
  const params: unknown[] = [userId];
  let monthSql = '';
  if (query.month) {
    monthSql = 'WHERE effective_date LIKE ?';
    params.push(`${query.month}%`);
  }
  const pendingSql = query.pendingOnly ? `AND COALESCE(verified, '') NOT IN ('true', '1')` : '';
  params.push(query.limit, query.offset, userId);

  const rows = (await db
    .prepare(
      `WITH ${SLOTS_CTE},
       scoped AS (
         SELECT * FROM slots
         ${monthSql}
       ),
       summary AS (
         SELECT
           COUNT(*)::int AS summary_total,
           COUNT(*) FILTER (WHERE COALESCE(verified, '') IN ('true', '1'))::int AS summary_verified,
           COUNT(*) FILTER (WHERE COALESCE(verified, '') NOT IN ('true', '1'))::int AS summary_pending
         FROM scoped
       )
       SELECT
         summary.summary_total,
         summary.summary_verified,
         summary.summary_pending,
         page.order_id,
         page.reference_number,
         page.po_number,
         page.customer,
         page.description,
         page.order_type,
         page.slot,
         page.installment_label,
         page.payment_date,
         page.amount,
         page.bank,
         page.method,
         page.reference,
         page.receipt,
         page.verified,
         rec.linked_reconciliation_id
       FROM summary
       LEFT JOIN LATERAL (
         SELECT * FROM scoped
         WHERE TRUE ${pendingSql}
         ORDER BY effective_date DESC NULLS LAST, order_id DESC, slot ASC
         LIMIT ? OFFSET ?
       ) page ON TRUE
       LEFT JOIN (
         SELECT order_id, COALESCE(payment_slot, 1) AS payment_slot, MAX(id) AS linked_reconciliation_id
         FROM reconciliation_records
         WHERE user_id = ? AND status = 'Matched' AND order_id IS NOT NULL
         GROUP BY order_id, COALESCE(payment_slot, 1)
       ) rec ON rec.order_id = page.order_id AND rec.payment_slot = page.slot`,
    )
    .all(...params)) as Array<Record<string, unknown>>;

  const first = rows[0];
  const summary: AccountingSummary = {
    total: Number(first?.summary_total) || 0,
    verified: Number(first?.summary_verified) || 0,
    pending: Number(first?.summary_pending) || 0,
  };

  const entries: AccountingPaymentEntry[] = [];
  for (const row of rows) {
    if (row.order_id == null) continue;
    const slot = (Number(row.slot) === 2 ? 2 : Number(row.slot) === 3 ? 3 : 1) as PaymentSlot;
    const receipt = String(row.receipt || '');
    entries.push({
      order_id: Number(row.order_id),
      payment_slot: slot,
      installment_label: String(row.installment_label || ''),
      order_ref: String(row.reference_number || ''),
      po_number: String(row.po_number || '').trim(),
      title: orderTitle({
        reference_number: String(row.reference_number || ''),
        po_number: String(row.po_number || ''),
        name: String(row.customer || ''),
        description: String(row.description || ''),
      }),
      customer: String(row.customer || ''),
      order_type: String(row.order_type || ''),
      payment_date: String(row.payment_date || ''),
      amount: String(row.amount || ''),
      bank: String(row.bank || ''),
      method: String(row.method || ''),
      reference: String(row.reference || ''),
      has_receipt: Boolean(receipt.trim()),
      payment_receipt_path: receipt,
      verified: isVerified(String(row.verified || '')),
      linked_reconciliation_id:
        row.linked_reconciliation_id == null ? null : Number(row.linked_reconciliation_id),
    });
  }

  return {
    entries,
    total: query.pendingOnly ? summary.pending : summary.total,
    limit: query.limit,
    offset: query.offset,
    month: query.month || 'all',
    summary,
  };
}
