import ExcelJS from 'exceljs';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { CATEGORY_LABELS } from '@/lib/expenses';
import type { Expense } from '@/lib/types';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const expenses = db
    .prepare(
      'SELECT * FROM expenses WHERE user_id = ? ORDER BY COALESCE(paid_date, created_at) DESC, id DESC'
    )
    .all(session.userId) as Expense[];

  const wb = new ExcelJS.Workbook();
  wb.creator = 'InvoiceFlow';
  const ws = wb.addWorksheet('Expenses');

  ws.columns = [
    { header: 'Category', key: 'category', width: 20 },
    { header: 'Merchant', key: 'merchant', width: 24 },
    { header: 'Amount (HKD)', key: 'amount_hkd', width: 15 },
    { header: 'Amount (RMB)', key: 'amount_rmb', width: 15 },
    { header: 'Paid Date', key: 'paid_date', width: 14 },
    { header: 'Order No.', key: 'order_no', width: 18 },
    { header: 'Platform (消費平台)', key: 'platform', width: 20 },
    { header: 'Payment Status', key: 'payment_status', width: 16 },
    { header: 'Notes', key: 'notes', width: 30 },
  ];

  expenses.forEach((e) => {
    ws.addRow({
      category: CATEGORY_LABELS[e.category] || e.category,
      merchant: e.merchant || '',
      amount_hkd: e.amount_hkd ?? '',
      amount_rmb: e.amount_rmb ?? '',
      paid_date: e.paid_date || '',
      order_no: e.order_no || '',
      platform: e.platform || '',
      payment_status: e.payment_status,
      notes: e.notes || '',
    });
  });

  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF16A34A' } };
  header.alignment = { vertical: 'middle' };

  ws.getColumn('C').numFmt = '#,##0.00';
  ws.getColumn('D').numFmt = '#,##0.00';
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  const buffer = await wb.xlsx.writeBuffer();
  const date = new Date().toISOString().split('T')[0];

  return new Response(buffer, {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="expenses-${date}.xlsx"`,
    },
  });
}
