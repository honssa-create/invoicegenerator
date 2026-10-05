import db from './db';
import { attachPrimaryReceipts } from './expense-server';
import type { Expense } from './types';

export type ExpenseListQuery = {
  dateStart?: string;
  dateEnd?: string;
  fundingSource?: string;
  reason?: string;
  platform?: string;
  search?: string;
  limit: number;
  offset: number;
};

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function parseExpenseListQuery(
  searchParams: URLSearchParams,
  opts?: { operatorUserId?: number },
): ExpenseListQuery & { operatorUserId?: number } {
  const dateStartRaw = searchParams.get('dateStart')?.trim() || '';
  const dateEndRaw = searchParams.get('dateEnd')?.trim() || '';
  const limitRaw = Number(searchParams.get('limit'));
  const offsetRaw = Number(searchParams.get('offset'));
  return {
    dateStart: YMD.test(dateStartRaw) ? dateStartRaw : '',
    dateEnd: YMD.test(dateEndRaw) ? dateEndRaw : '',
    fundingSource: searchParams.get('fundingSource')?.trim() || '',
    reason: searchParams.get('reason')?.trim() || '',
    platform: searchParams.get('platform')?.trim() || '',
    search: searchParams.get('search')?.trim() || '',
    limit: Math.min(200, Math.max(1, Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 30)),
    offset: Math.max(0, Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0),
    operatorUserId: opts?.operatorUserId,
  };
}

function buildWhere(
  query: ExpenseListQuery,
  params: (string | number)[],
  userId: number,
  operatorUserId?: number,
): string {
  let where = '';
  if (operatorUserId != null) {
    where += ' AND created_by_user_id = ?';
    params.push(operatorUserId);
  }
  if (query.dateStart) {
    where += ' AND paid_date >= ?';
    params.push(query.dateStart);
  }
  if (query.dateEnd) {
    where += ' AND paid_date <= ?';
    params.push(query.dateEnd);
  }
  if (query.reason) {
    where += ' AND category = ?';
    params.push(query.reason);
  }
  if (query.platform) {
    where += ' AND platform = ?';
    params.push(query.platform);
  }
  if (query.fundingSource) {
    where += " AND COALESCE(funding_source, '') = ?";
    params.push(query.fundingSource);
  }
  const q = (query.search || '').trim();
  if (q) {
    const like = `%${q.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
    where += ` AND (
      COALESCE(batch_id, '') ILIKE ? ESCAPE '\\'
      OR COALESCE(receipt_no, '') ILIKE ? ESCAPE '\\'
      OR COALESCE(merchant, '') ILIKE ? ESCAPE '\\'
      OR COALESCE(supplier_input, '') ILIKE ? ESCAPE '\\'
      OR COALESCE(platform, '') ILIKE ? ESCAPE '\\'
      OR COALESCE(notes, '') ILIKE ? ESCAPE '\\'
    )`;
    params.push(like, like, like, like, like, like);
  }
  return where;
}

export async function listExpensesPage(
  userId: number,
  query: ExpenseListQuery & { operatorUserId?: number },
): Promise<{ expenses: Expense[]; total: number; limit: number; offset: number }> {
  const countParams: (string | number)[] = [userId];
  let where = buildWhere(query, countParams, userId, query.operatorUserId);

  const [totalRow, rows] = await Promise.all([
    db
      .prepare(`SELECT COUNT(*)::int AS total FROM expenses WHERE user_id = ?${where}`)
      .get(...countParams) as Promise<{ total: number } | undefined>,
    (async () => {
      const listParams = [...countParams, query.limit, query.offset];
      return (await db
        .prepare(
          `SELECT * FROM expenses WHERE user_id = ?${where}
           ORDER BY COALESCE(paid_date, created_at) DESC, id DESC
           LIMIT ? OFFSET ?`
        )
        .all(...listParams)) as Expense[];
    })(),
  ]);

  await attachPrimaryReceipts(rows);

  return {
    expenses: rows,
    total: Number(totalRow?.total) || 0,
    limit: query.limit,
    offset: query.offset,
  };
}
