import * as XLSX from 'xlsx';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { getInvoiceWithDetails } from '@/lib/invoices';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const rows = db
    .prepare('SELECT id FROM invoices WHERE user_id = ? ORDER BY created_at DESC')
    .all(session.userId) as { id: number }[];

  const invoices = rows
    .map((r) => getInvoiceWithDetails(r.id, session.userId))
    .filter((i): i is NonNullable<typeof i> => Boolean(i));

  const data = invoices.map((inv) => ({
    'Invoice #': inv.invoice_number,
    Customer: inv.customer_name,
    Status: inv.status,
    'Issue Date': inv.issue_date,
    'Due Date': inv.due_date,
    Subtotal: inv.subtotal,
    'Tax Rate (%)': inv.tax_rate,
    Tax: inv.tax_amount,
    Total: inv.total,
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [
    { wch: 18 }, { wch: 24 }, { wch: 12 }, { wch: 14 }, { wch: 14 },
    { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Invoices');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const date = new Date().toISOString().split('T')[0];

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="invoices-${date}.xlsx"`,
    },
  });
}
