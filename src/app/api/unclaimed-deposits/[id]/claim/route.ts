import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import {
  getPaymentWithDetails,
  getUnclaimedDeposits,
  markInvoicePaidIfFullyCleared,
} from '@/lib/payments';
import { getTeamUserIds } from '@/lib/team';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { invoice_id } = await request.json();
    const depositId = Number(params.id);

    if (!invoice_id) {
      return NextResponse.json({ error: 'Invoice is required' }, { status: 400 });
    }

    const teamIds = getTeamUserIds(session.userId);
    const placeholders = teamIds.map(() => '?').join(', ');

    const deposit = db
      .prepare(
        `SELECT * FROM unclaimed_deposits WHERE id = ? AND user_id IN (${placeholders}) AND status = 'unclaimed'`
      )
      .get(depositId, ...teamIds) as
      | {
          id: number;
          amount: number;
          deposit_date: string;
          bank: string;
          remarks: string | null;
        }
      | undefined;

    if (!deposit) {
      return NextResponse.json({ error: 'Unclaimed deposit not found' }, { status: 404 });
    }

    const invoice = db
      .prepare(
        `SELECT i.id, i.status FROM invoices i
         WHERE i.id = ? AND i.user_id IN (${placeholders}) AND i.status != 'paid'`
      )
      .get(invoice_id, ...teamIds);

    if (!invoice) {
      return NextResponse.json(
        { error: 'Invoice not found or already fully paid' },
        { status: 404 }
      );
    }

    const claimDeposit = db.transaction(() => {
      const paymentResult = db
        .prepare(
          `INSERT INTO payments (
            user_id, invoice_id, amount, payment_date, receipt_note,
            status, verified_at, verified_by, locked, created_by
          ) VALUES (?, ?, ?, ?, ?, 'bank_cleared', datetime('now'), ?, 1, ?)`
        )
        .run(
          session.userId,
          invoice_id,
          deposit.amount,
          deposit.deposit_date,
          `Linked from unclaimed deposit #${deposit.id} (${deposit.bank})${deposit.remarks ? ` — ${deposit.remarks}` : ''}`,
          session.userId,
          session.userId
        );

      const paymentId = paymentResult.lastInsertRowid as number;

      db.prepare(
        `UPDATE unclaimed_deposits
         SET status = 'claimed',
             claimed_invoice_id = ?,
             claimed_payment_id = ?,
             claimed_at = datetime('now'),
             claimed_by = ?
         WHERE id = ? AND user_id IN (${placeholders})`
      ).run(invoice_id, paymentId, session.userId, depositId, ...teamIds);

      return paymentId;
    });

    const paymentId = claimDeposit();
    markInvoicePaidIfFullyCleared(invoice_id, session.userId);

    const payment = getPaymentWithDetails(paymentId, session.userId);
    const deposits = getUnclaimedDeposits(session.userId);

    return NextResponse.json({ payment, deposits });
  } catch {
    return NextResponse.json({ error: 'Failed to claim deposit' }, { status: 500 });
  }
}
