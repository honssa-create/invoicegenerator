import { NextResponse } from 'next/server';
import { requireApiAccess } from '@/lib/api-guard';
import { rentalOwnerId } from '@/lib/org-server';
import { getRentalPaymentDetail } from '@/lib/rental-ledger-server';

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
