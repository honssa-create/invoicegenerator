import ExcelJS from 'exceljs';
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

  const wb = new ExcelJS.Workbook();
  wb.creator = 'InvoiceFlow';
  const ws = wb.addWorksheet('Invoices');

  ws.columns = [
    { header: 'Invoice #', key: 'invoice_number', width: 18 },
    { header: 'Customer', key: 'customer_name', width: 24 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Issue Date', key: 'issue_date', width: 14 },
    { header: 'Due Date', key: 'due_date', width: 14 },
    { header: 'Subtotal', key: 'subtotal', width: 14 },
    { header: 'Tax Rate (%)', key: 'tax_rate', width: 14 },
    { header: 'Tax', key: 'tax_amount', width: 14 },
    { header: 'Total', key: 'total', width: 14 },
  ];

  invoices.forEach((inv) => {
    ws.addRow({
      invoice_number: inv.invoice_number,
      customer_name: inv.customer_name,
      status: inv.status,
      issue_date: inv.issue_date,
      due_date: inv.due_date,
      subtotal: inv.subtotal,
      tax_rate: inv.tax_rate,
      tax_amount: inv.tax_amount,
      total: inv.total,
    });
  });

  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF16A34A' } };
  header.alignment = { vertical: 'middle' };

  ['F', 'H', 'I'].forEach((col) => {
    ws.getColumn(col).numFmt = '#,##0.00';
  });

  ws.views = [{ state: 'frozen', ySplit: 1 }];

  const buffer = await wb.xlsx.writeBuffer();
  const date = new Date().toISOString().split('T')[0];

  return new Response(buffer, {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="invoices-${date}.xlsx"`,
    },
  });
}
