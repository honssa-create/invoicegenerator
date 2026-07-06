import { NextResponse } from 'next/server';
import { denyReadOnlyWrite, requireApiAccess } from '@/lib/api-guard';
import { rentalOwnerId } from '@/lib/org-server';
import { createRentalPayment } from '@/lib/rental-ledger-server';
import { normalizeStoredDate } from '@/lib/rentals';

export async function POST(request: Request) {
  const session = await requireApiAccess(request, 'rentals');
  if (session instanceof NextResponse) return session;
  const denied = denyReadOnlyWrite(session, 'rentals', request.method);
  if (denied) return denied;
  try {
    const body = await request.json();
    const paymentDate = normalizeStoredDate(body.paymentDate) || new Date().toISOString().slice(0, 10);
    const amount = Number(body.amount);
    const tenantId = Number(body.tenantId);
    if (!tenantId || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'tenantId and positive amount required' }, { status: 400 });
    }
    const payment = createRentalPayment(rentalOwnerId(session.userId), {
      tenantId,
      paymentDate,
      amount,
      method: body.method,
      reference: body.reference,
      notes: body.notes,
      receiptImagePath: body.receiptImagePath,
    });
    return NextResponse.json({ payment }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to create payment' }, { status: 500 });
  }
}
