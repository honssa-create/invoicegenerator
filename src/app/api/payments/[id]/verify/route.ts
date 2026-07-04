import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { getPaymentWithDetails, markInvoicePaidIfFullyCleared } from '@/lib/payments';
import { getTeamUserIds } from '@/lib/team';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = db.prepare('SELECT role FROM users WHERE id = ?').get(session.userId) as {
    role: string;
  };

  if (user?.role !== 'accountant') {
    return NextResponse.json({ error: 'Only accountants can verify bank clearance' }, { status: 403 });
  }

  const paymentId = Number(params.id);
  const teamIds = getTeamUserIds(session.userId);
  const placeholders = teamIds.map(() => '?').join(', ');

  const payment = db
    .prepare(
      `SELECT * FROM payments WHERE id = ? AND user_id IN (${placeholders}) AND status = 'pending_verification' AND locked = 0`
    )
    .get(paymentId, ...teamIds) as { id: number; invoice_id: number } | undefined;

  if (!payment) {
    return NextResponse.json(
      { error: 'Payment not found or already verified' },
      { status: 404 }
    );
  }

  db.prepare(
    `UPDATE payments
     SET status = 'bank_cleared',
         verified_at = datetime('now'),
         verified_by = ?,
         locked = 1
     WHERE id = ? AND user_id IN (${placeholders})`
  ).run(session.userId, paymentId, ...teamIds);

  markInvoicePaidIfFullyCleared(payment.invoice_id, session.userId);

  const updated = getPaymentWithDetails(paymentId, session.userId);
  return NextResponse.json({ payment: updated });
}
