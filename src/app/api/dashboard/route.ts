import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { listInvoices, sumInvoiceTotals } from '@/lib/invoices';
import { getDataOwnerId } from '@/lib/org-server';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ownerId = await getDataOwnerId(session);

  const [
    totalInvoices,
    totalRevenue,
    pendingAmount,
    overdueCount,
    recentInvoices,
    customerCount,
    expenseTotals,
  ] = await Promise.all([
    db.prepare('SELECT COUNT(*) as count FROM invoices WHERE user_id = ?').get(ownerId) as Promise<{ count: number }>,
    db.prepare(
      `SELECT COALESCE(SUM(ii.amount), 0) as subtotal
       FROM invoices i
       JOIN invoice_items ii ON ii.invoice_id = i.id
       WHERE i.user_id = ? AND i.status = 'paid'`
    ).get(ownerId) as Promise<{ subtotal: number }>,
    sumInvoiceTotals(ownerId, ['sent', 'overdue']),
    db.prepare(
      `SELECT COUNT(*) as count FROM invoices WHERE user_id = ? AND status = 'overdue'`
    ).get(ownerId) as Promise<{ count: number }>,
    listInvoices(ownerId, { limit: 5 }),
    db.prepare('SELECT COUNT(*) as count FROM customers WHERE user_id = ?').get(ownerId) as Promise<{ count: number }>,
    db.prepare(
      `SELECT
         COUNT(*) as count,
         COALESCE(SUM(amount_hkd), 0) as hkd,
         COALESCE(SUM(amount_rmb), 0) as rmb
       FROM expenses WHERE user_id = ?`
    ).get(ownerId) as Promise<{ count: number; hkd: number; rmb: number }>,
  ]);

  return NextResponse.json({
    totalInvoices: totalInvoices.count,
    totalRevenue: totalRevenue.subtotal,
    pendingAmount,
    overdueCount: overdueCount.count,
    customerCount: customerCount.count,
    recentInvoices,
    expenseCount: expenseTotals.count,
    totalExpensesHkd: expenseTotals.hkd,
    totalExpensesRmb: expenseTotals.rmb,
  });
}
