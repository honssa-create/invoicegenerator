import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import {
  getPaymentsByStatus,
  getUnclaimedDeposits,
} from '@/lib/payments';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const unclaimedDeposits = getUnclaimedDeposits(session.userId);
  const pendingPayments = getPaymentsByStatus(session.userId, 'pending_verification');
  const bankClearedPayments = getPaymentsByStatus(session.userId, 'bank_cleared').slice(0, 20);

  const unclaimedTotal = unclaimedDeposits.reduce((sum, d) => sum + d.amount, 0);
  const pendingTotal = pendingPayments.reduce((sum, p) => sum + p.amount, 0);
  const bankClearedTotal = bankClearedPayments.reduce((sum, p) => sum + p.amount, 0);

  const user = db
    .prepare('SELECT role FROM users WHERE id = ?')
    .get(session.userId) as { role: string };

  return NextResponse.json({
    unclaimedDeposits,
    unclaimedTotal,
    pendingPayments,
    pendingTotal,
    bankClearedPayments,
    bankClearedTotal,
    pendingVerificationCount: pendingPayments.length,
    userRole: user?.role || 'sales',
  });
}
