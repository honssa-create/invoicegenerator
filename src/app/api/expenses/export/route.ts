import * as XLSX from 'xlsx';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { categoryLabel } from '@/lib/expenses';
import { expenseWhereClause } from '@/lib/org-server';
import type { Expense } from '@/lib/types';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { sql, params } = expenseWhereClause(session);
  const expenses = db
    .prepare(
      `SELECT e.*, (SELECT COUNT(*) FROM expense_receipts r WHERE r.expense_id = e.id) as receipt_count
       FROM expenses e
       WHERE e.${sql}
       ORDER BY COALESCE(e.paid_date, e.created_at) DESC, e.id DESC`
    )
    .all(...params) as (Expense & { receipt_count: number })[];

  const data = expenses.map((e) => ({
    'Paid Date (支出日期)': e.paid_date || '',
    'Platform (消費平台)': e.platform || '',
    'Supplier (供應商)': e.merchant || '',
    'Supplier Input 供應商(input)': e.supplier_input || '',
    'Notes (注意事項)': e.notes || '',
    'Amount (RMB)': e.amount_rmb ?? null,
    'Amount (HKD)': e.amount_hkd ?? null,
    'Payment Method (支付方式)': e.payment_method || '',
    'Expense Reason (支出原因)': categoryLabel(e.category),
    Receipts: e.receipt_count,
    'Special Notes (特別事項)': e.special_notes || '',
    'Batch ID': e.batch_id || '',
    'Receipt No.': e.receipt_no || '',
    'Order No.': e.order_no || '',
    'Payment Status': e.payment_status,
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [
    { wch: 14 }, { wch: 18 }, { wch: 24 }, { wch: 28 }, { wch: 14 }, { wch: 14 },
    { wch: 22 }, { wch: 22 }, { wch: 10 }, { wch: 28 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 15 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Expenses');
  // Standard SpreadsheetML output — opens cleanly in Excel, LibreOffice, Google Sheets.
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const date = new Date().toISOString().split('T')[0];

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="expenses-${date}.xlsx"`,
    },
  });
}
