import { NextResponse } from 'next/server';
import { denyReadOnlyWrite, requireApiAccess } from '@/lib/api-guard';
import { rentalOwnerId } from '@/lib/org-server';
import { deleteRentalPayment, getRentalPaymentDetail } from '@/lib/rental-ledger-server';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await requireApiAccess(request, 'rentals');
  if (session instanceof NextResponse) return session;
  const detail = getRentalPaymentDetail(params.id, rentalOwnerId(session.userId));
  if (!detail) return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
  return NextResponse.json(detail);
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await requireApiAccess(request, 'rentals');
  if (session instanceof NextResponse) return session;
  const denied = denyReadOnlyWrite(session, 'rentals', request.method);
  if (denied) return denied;
  const ok = deleteRentalPayment(params.id, rentalOwnerId(session.userId));
  if (!ok) return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
