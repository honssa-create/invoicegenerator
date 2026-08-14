import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { getInvoiceWithDetails, listInvoices, markSentInvoicesOverdue } from '@/lib/invoices';
import { getDataOwnerId } from '@/lib/org-server';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ownerId = await getDataOwnerId(session.userId);
  await markSentInvoicesOverdue(ownerId);

  const totalInvoices = (
    await db.prepare('SELECT COUNT(*) as count FROM invoices WHERE user_id = ?').get(ownerId) as {
      count: number;
    }
  ).count;

  const totalRevenue = (
    await db
      .prepare(
        `SELECT COALESCE(SUM(ii.amount), 0) as subtotal
         FROM invoices i
         JOIN invoice_items ii ON ii.invoice_id = i.id
         WHERE i.user_id = ? AND i.status = 'paid'`
      )
      .get(ownerId) as { subtotal: number }
  ).subtotal;

  const pendingInvoices = await listInvoices(ownerId, { status: ['sent', 'overdue'] });
  const pendingAmount = pendingInvoices.reduce((sum, inv) => sum + inv.total, 0);

  const overdueCount = (
    await db
      .prepare(
        `SELECT COUNT(*) as count FROM invoices WHERE user_id = ? AND status = 'overdue'`
      )
      .get(ownerId) as { count: number }
  ).count;

  const recentIds = await db
    .prepare(
      `SELECT id FROM invoices WHERE user_id = ? ORDER BY created_at DESC LIMIT 5`
    )
    .all(ownerId) as { id: number }[];

  const recentInvoices = (await Promise.all(
    recentIds.map((r) => getInvoiceWithDetails(r.id, ownerId))
  )).filter(Boolean);

  const customerCount = (
    await db.prepare('SELECT COUNT(*) as count FROM customers WHERE user_id = ?').get(ownerId) as {
      count: number;
    }
  ).count;

  const expenseTotals = await db
    .prepare(
      `SELECT
         COUNT(*) as count,
         COALESCE(SUM(amount_hkd), 0) as hkd,
         COALESCE(SUM(amount_rmb), 0) as rmb
       FROM expenses WHERE user_id = ?`
    )
    .get(ownerId) as { count: number; hkd: number; rmb: number };

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
