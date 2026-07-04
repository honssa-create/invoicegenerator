import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { getPaymentWithDetails, getPaymentsByStatus, getInvoicePayments } from '@/lib/payments';
import { getTeamUserIds } from '@/lib/team';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const invoiceId = searchParams.get('invoice_id');

  if (invoiceId) {
    const payments = getInvoicePayments(Number(invoiceId), session.userId);
    return NextResponse.json({ payments });
  }

  if (status) {
    const payments = getPaymentsByStatus(session.userId, status);
    return NextResponse.json({ payments });
  }

  return NextResponse.json({ error: 'status or invoice_id required' }, { status: 400 });
}

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { invoice_id, amount, payment_date, receipt_note, receipt_filename } = await request.json();

    if (!invoice_id || !amount || !payment_date) {
      return NextResponse.json(
        { error: 'Invoice, amount, and payment date are required' },
        { status: 400 }
      );
    }

    const teamIds = getTeamUserIds(session.userId);
    const placeholders = teamIds.map(() => '?').join(', ');

    const invoice = db
      .prepare(`SELECT id FROM invoices WHERE id = ? AND user_id IN (${placeholders})`)
      .get(invoice_id, ...teamIds);

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    const result = db
      .prepare(
        `INSERT INTO payments (
          user_id, invoice_id, amount, payment_date, receipt_note, receipt_filename,
          status, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, 'pending_verification', ?)`
      )
      .run(
        session.userId,
        invoice_id,
        Number(amount),
        payment_date,
        receipt_note?.trim() || null,
        receipt_filename?.trim() || null,
        session.userId
      );

    const payment = getPaymentWithDetails(result.lastInsertRowid as number, session.userId);
    return NextResponse.json({ payment }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 });
  }
}
