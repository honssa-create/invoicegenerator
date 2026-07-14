import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { getInvoiceWithDetails } from '@/lib/invoices';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const totalInvoices = (
    db.prepare('SELECT COUNT(*) as count FROM invoices WHERE user_id = ?').get(session.userId) as {
      count: number;
    }
  ).count;

  const totalRevenue = (
    db
      .prepare(
        `SELECT COALESCE(SUM(ii.amount), 0) as subtotal
         FROM invoices i
         JOIN invoice_items ii ON ii.invoice_id = i.id
         WHERE i.user_id = ? AND i.status = 'paid'`
      )
      .get(session.userId) as { subtotal: number }
  ).subtotal;

  const pendingInvoices = db
    .prepare(
      `SELECT i.id FROM invoices i WHERE i.user_id = ? AND i.status IN ('sent', 'overdue')`
    )
    .all(session.userId) as { id: number }[];

  let pendingAmount = 0;
  for (const inv of pendingInvoices) {
    const details = getInvoiceWithDetails(inv.id, session.userId);
    if (details) pendingAmount += details.total;
  }

  const overdueCount = (
    db
      .prepare(
        `SELECT COUNT(*) as count FROM invoices WHERE user_id = ? AND status = 'overdue'`
      )
      .get(session.userId) as { count: number }
  ).count;

  const recentIds = db
    .prepare(
      `SELECT id FROM invoices WHERE user_id = ? ORDER BY created_at DESC LIMIT 5`
    )
    .all(session.userId) as { id: number }[];

  const recentInvoices = recentIds
    .map((r) => getInvoiceWithDetails(r.id, session.userId))
    .filter(Boolean);

  const customerCount = (
    db.prepare('SELECT COUNT(*) as count FROM customers WHERE user_id = ?').get(session.userId) as {
      count: number;
    }
  ).count;

  const expenseTotals = db
    .prepare(
      `SELECT
         COUNT(*) as count,
         COALESCE(SUM(amount_hkd), 0) as hkd,
         COALESCE(SUM(amount_rmb), 0) as rmb
       FROM expenses WHERE user_id = ?`
    )
    .get(session.userId) as { count: number; hkd: number; rmb: number };

  return NextResponse.json({
    totalInvoices,
    totalRevenue,
    pendingAmount,
    overdueCount,
    customerCount,
    recentInvoices,
    expenseCount: expenseTotals.count,
    totalExpensesHkd: expenseTotals.hkd,
    totalExpensesRmb: expenseTotals.rmb,
  });
}
