import db from './db';
import type { InvoiceItem, InvoiceWithDetails } from './types';
import { calculateInvoiceTotals } from './utils';

export type InvoiceListQuery = {
  dateStart?: string;
  dateEnd?: string;
  status?: string;
  client?: string;
  search?: string;
  limit: number;
  offset: number;
};

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function parseInvoiceListQuery(searchParams: URLSearchParams): InvoiceListQuery {
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

function buildWhere(query: InvoiceListQuery, params: (string | number)[]): string {
  let where = '';
  if (query.dateStart) {
    where += ' AND i.issue_date >= ?';
    params.push(query.dateStart);
  }
  if (query.dateEnd) {
    where += ' AND i.issue_date <= ?';
    params.push(query.dateEnd);
  }
  if (query.status) {
    where += ' AND i.status = ?';
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
      i.invoice_number ILIKE ? ESCAPE '\\'
      OR COALESCE(c.name, '') ILIKE ? ESCAPE '\\'
    )`;
    params.push(like, like);
  }
  return where;
}

export async function listInvoicesPage(
  userId: number,
  query: InvoiceListQuery,
): Promise<{ invoices: InvoiceWithDetails[]; total: number; limit: number; offset: number }> {
  const countParams: (string | number)[] = [userId];
  const where = buildWhere(query, countParams);

  const [totalRow, rows] = await Promise.all([
    db
      .prepare(
        `SELECT COUNT(*)::int AS total
         FROM invoices i
         JOIN customers c ON c.id = i.customer_id
         WHERE i.user_id = ?${where}`
      )
      .get(...countParams) as Promise<{ total: number } | undefined>,
    (async () => {
      const listParams = [...countParams, query.limit, query.offset];
      return (await db
        .prepare(
          `SELECT i.*, c.name as customer_name, c.email as customer_email,
                  c.company_name as customer_company_name, c.phone as customer_phone,
                  c.address as customer_address
           FROM invoices i
           JOIN customers c ON c.id = i.customer_id
           WHERE i.user_id = ?${where}
           ORDER BY i.issue_date DESC, i.id DESC
           LIMIT ? OFFSET ?`
        )
        .all(...listParams)) as Array<Record<string, unknown>>;
    })(),
  ]);

  if (!rows.length) {
    return { invoices: [], total: Number(totalRow?.total) || 0, limit: query.limit, offset: query.offset };
  }

  const ids = rows.map((r) => Number(r.id));
  const placeholders = ids.map(() => '?').join(',');
  const itemRows = (await db
    .prepare(`SELECT * FROM invoice_items WHERE invoice_id IN (${placeholders}) ORDER BY id`)
    .all(...ids)) as InvoiceItem[];

  const itemsByInvoice = new Map<number, InvoiceItem[]>();
  for (const row of itemRows) {
    const list = itemsByInvoice.get(row.invoice_id);
    if (list) list.push(row);
    else itemsByInvoice.set(row.invoice_id, [row]);
  }

  const invoices: InvoiceWithDetails[] = rows.map((invoice) => {
    const items = itemsByInvoice.get(Number(invoice.id)) || [];
    const { subtotal, discountAmount, taxAmount, total } = calculateInvoiceTotals(items, {
      taxRate: invoice.tax_rate as number,
      discountType: invoice.discount_type as string,
      discountValue: invoice.discount_value as number,
      shippingAmount: invoice.shipping_amount as number,
    });
    return {
      ...(invoice as unknown as InvoiceWithDetails),
      items,
      files: [],
      subtotal,
      discountAmount,
      taxAmount,
      total,
    };
  });

  return {
    invoices,
    total: Number(totalRow?.total) || 0,
    limit: query.limit,
    offset: query.offset,
  };
}
