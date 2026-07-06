import { NextResponse } from 'next/server';
import { denyReadOnlyWrite, requireApiAccess } from '@/lib/api-guard';
import { getRentalUnit, getRentalUnitDetail, updateRentalUnit } from '@/lib/rental-server';
import { currentBillingPeriod } from '@/lib/rentals';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await requireApiAccess(request, 'rentals');
  if (session instanceof NextResponse) return session;
  const { searchParams } = new URL(request.url);
  const period = searchParams.get('period') || currentBillingPeriod();
  const detail = getRentalUnitDetail(params.id, session.userId, period);
  if (!detail) return NextResponse.json({ error: 'Unit not found' }, { status: 404 });
  return NextResponse.json(detail);
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await requireApiAccess(request, 'rentals');
  if (session instanceof NextResponse) return session;
  const denied = denyReadOnlyWrite(session, 'rentals', request.method);
  if (denied) return denied;
  try {
    if (!getRentalUnit(params.id, session.userId)) {
      return NextResponse.json({ error: 'Unit not found' }, { status: 404 });
    }
    const body = await request.json();
    const unit = updateRentalUnit(params.id, session.userId, body);
    return NextResponse.json({ unit });
  } catch {
    return NextResponse.json({ error: 'Failed to update rental unit' }, { status: 500 });
  }
}
