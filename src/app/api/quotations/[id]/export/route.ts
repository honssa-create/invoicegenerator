import * as XLSX from 'xlsx';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { getQuotationWithDetails } from '@/lib/quotation-server';
import { getDataOwnerId } from '@/lib/org-server';
import { logActivity } from '@/lib/activity';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const ownerId = getDataOwnerId(session.userId);
  const q = getQuotationWithDetails(params.id, ownerId);
  if (!q) {
    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }

  const aoa: (string | number)[][] = [
    ['Quotation', q.quote_number],
    ['Customer', q.customer_name || ''],
    ['Status', q.status],
    ['Issue Date', q.issue_date],
    ['Valid Until', q.valid_until || ''],
    [],
    ['Description', 'Qty', 'Unit Price', 'Amount'],
    ...q.items.map((i) => [i.description, i.quantity, i.unit_price, i.amount]),
    [],
    ['', '', 'Subtotal', q.subtotal],
    ['', '', `Tax (${q.tax_rate}%)`, q.tax_amount],
    ['', '', 'Total', q.total],
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 44 }, { wch: 10 }, { wch: 14 }, { wch: 14 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Quotation');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  logActivity('quotation', params.id, session.userId, 'activity', session.name, 'exported quotation to Excel');

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${q.quote_number}.xlsx"`,
    },
  });
}
