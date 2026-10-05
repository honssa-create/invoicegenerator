import db from './db';
import { calculateQuotationTotals, type QuotationItem, type QuotationWithDetails } from './quotations';

export type QuotationListQuery = {
  dateStart?: string;
  dateEnd?: string;
  status?: string;
  client?: string;
  search?: string;
  limit: number;
  offset: number;
};

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function parseQuotationListQuery(searchParams: URLSearchParams): QuotationListQuery {
  const dateStartRaw = searchParams.get('dateStart')?.trim() || '';
  const dateEndRaw = searchParams.get('dateEnd')?.trim() || '';
  const limitRaw = Number(searchParams.get('limit'));
  const offsetRaw = Number(searchParams.get('offset'));
  return {
    dateStart: YMD.test(dateStartRaw) ? dateStartRaw : '',
    dateEnd: YMD.test(dateEndRaw) ? dateEndRaw : '',
    status: searchParams.get('status')?.trim() || '',
    client: searchParams.get('client')?.trim() || '',
    search: searchParams.get('search')?.trim() || '',
    limit: Math.min(500, Math.max(1, Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 50)),
    offset: Math.max(0, Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0),
  };
}

function buildWhere(query: QuotationListQuery, params: (string | number)[]): string {
  let where = '';
  if (query.dateStart) {
    where += ' AND q.issue_date >= ?';
    params.push(query.dateStart);
  }
  if (query.dateEnd) {
    where += ' AND q.issue_date <= ?';
    params.push(query.dateEnd);
  }
  if (query.status) {
    where += ' AND q.status = ?';
    params.push(query.status);
  }
  if (query.client) {
    where += ' AND c.name = ?';
    params.push(query.client);
  }
  const q = (query.search || '').trim();
  if (q) {
    const like = `%${q.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
    where += ` AND (
      q.quote_number ILIKE ? ESCAPE '\\'
      OR COALESCE(c.name, '') ILIKE ? ESCAPE '\\'
    )`;
    params.push(like, like);
  }
  return where;
}

export async function listQuotationsPage(
  userId: number,
  query: QuotationListQuery,
): Promise<{ quotations: QuotationWithDetails[]; total: number; limit: number; offset: number }> {
  const countParams: (string | number)[] = [userId];
  const where = buildWhere(query, countParams);

  const [totalRow, rows] = await Promise.all([
    db
      .prepare(
        `SELECT COUNT(*)::int AS total
         FROM quotations q
         LEFT JOIN customers c ON c.id = q.customer_id
         WHERE q.user_id = ?${where}`
      )
      .get(...countParams) as Promise<{ total: number } | undefined>,
    (async () => {
      const listParams = [...countParams, query.limit, query.offset];
      return (await db
        .prepare(
          `SELECT q.*, c.name as customer_name, c.email as customer_email,
                  c.company_name as customer_company_name, c.phone as customer_phone,
                  c.address as customer_address
           FROM quotations q
           LEFT JOIN customers c ON c.id = q.customer_id
           WHERE q.user_id = ?${where}
           ORDER BY q.issue_date DESC, q.id DESC
           LIMIT ? OFFSET ?`
        )
        .all(...listParams)) as Array<Record<string, unknown>>;
    })(),
  ]);

  if (!rows.length) {
    return { quotations: [], total: Number(totalRow?.total) || 0, limit: query.limit, offset: query.offset };
  }

  const ids = rows.map((r) => Number(r.id));
  const placeholders = ids.map(() => '?').join(',');
  const itemRows = (await db
    .prepare(`SELECT * FROM quotation_items WHERE quotation_id IN (${placeholders}) ORDER BY id`)
    .all(...ids)) as QuotationItem[];

  const itemsByQ = new Map<number, QuotationItem[]>();
  for (const row of itemRows) {
    const list = itemsByQ.get(row.quotation_id);
    if (list) list.push(row);
    else itemsByQ.set(row.quotation_id, [row]);
  }

  const quotations: QuotationWithDetails[] = rows.map((quotation) => {
    const items = itemsByQ.get(Number(quotation.id)) || [];
    const totals = calculateQuotationTotals(items, {
      taxRate: quotation.tax_rate as number,
      discountType: quotation.discount_type as string,
      discountValue: quotation.discount_value as number,
      shippingAmount: quotation.shipping_amount as number,
    });
    return {
      ...(quotation as unknown as QuotationWithDetails),
      items,
      files: [],
      linked_order: null,
      ...totals,
    };
  });

  return {
    quotations,
    total: Number(totalRow?.total) || 0,
    limit: query.limit,
    offset: query.offset,
  };
}
