import * as XLSX from 'xlsx';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import {
  categoryLabel,
  expensePaymentDisplay,
  fundingSourceLabel,
  paymentChannelLabel,
} from '@/lib/expenses';
import {
  parseExpenseExportDate,
  parseExpenseExportFundingSource,
} from '@/lib/expense-export';
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

  const { searchParams } = new URL(request.url);
  const paidFrom = parseExpenseExportDate(searchParams.get('paid_from'));
  const paidTo = parseExpenseExportDate(searchParams.get('paid_to'));
  const createdFrom = parseExpenseExportDate(searchParams.get('created_from'));
  const createdTo = parseExpenseExportDate(searchParams.get('created_to'));
  const fundingSource = parseExpenseExportFundingSource(searchParams.get('funding_source'));

  const { sql, params } = expenseWhereClause(session);
  const conditions = [`e.${sql}`];
  const queryParams: (string | number)[] = [...params];

  if (paidFrom) {
    conditions.push('e.paid_date >= ?');
    queryParams.push(paidFrom);
  }
  if (paidTo) {
    conditions.push('e.paid_date <= ?');
    queryParams.push(paidTo);
  }
  if (createdFrom) {
    conditions.push('date(e.created_at) >= date(?)');
    queryParams.push(createdFrom);
  }
  if (createdTo) {
    conditions.push('date(e.created_at) <= date(?)');
    queryParams.push(createdTo);
  }
  if (fundingSource) {
    conditions.push('e.funding_source = ?');
    queryParams.push(fundingSource);
  }

  const expenses = db
    .prepare(
      `SELECT e.*, (SELECT COUNT(*) FROM expense_receipts r WHERE r.expense_id = e.id) as receipt_count
       FROM expenses e
       WHERE ${conditions.join(' AND ')}
       ORDER BY COALESCE(e.paid_date, e.created_at) DESC, e.id DESC`
    )
    .all(...queryParams) as (Expense & { receipt_count: number })[];

  const data = expenses.map((e) => ({
    'Paid Date (支出日期)': e.paid_date || '',
    'Created Date (建立日期)': e.created_at?.slice(0, 10) || '',
    'Platform (消費平台)': e.platform || '',
    'Supplier (供應商)': e.merchant || '',
    'Supplier Input 供應商(input)': e.supplier_input || '',
    'Notes (注意事項)': e.notes || '',
    'Amount (RMB)': e.amount_rmb ?? null,
    'Amount (HKD)': e.amount_hkd ?? null,
    'Payment Channel (支付渠道)': paymentChannelLabel(e.payment_channel),
    'Funding Source (扣款來源)': fundingSourceLabel(e.funding_source),
    'Card Last 4 (信用卡尾四位)': e.card_last4 || '',
    'Payment Method (支付方式) [legacy]': e.payment_method || expensePaymentDisplay(e),
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
    { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 24 }, { wch: 28 }, { wch: 14 }, { wch: 14 },
    { wch: 22 }, { wch: 22 }, { wch: 10 }, { wch: 28 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 15 },
    { wch: 15 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Expenses');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const date = new Date().toISOString().split('T')[0];

  const suffixParts: string[] = [];
  if (paidFrom || paidTo) suffixParts.push(`paid-${paidFrom || 'start'}-to-${paidTo || 'end'}`);
  if (createdFrom || createdTo) {
    suffixParts.push(`created-${createdFrom || 'start'}-to-${createdTo || 'end'}`);
  }
  if (fundingSource) suffixParts.push(fundingSource);
  const suffix = suffixParts.length ? `-${suffixParts.join('_')}` : '';

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="expenses-${date}${suffix}.xlsx"`,
    },
  });
}
