import { NextResponse } from 'next/server';
import { denyReadOnlyWrite, requireApiAccess } from '@/lib/api-guard';
import { rentalOwnerId } from '@/lib/org-server';
import { getRentalUnit, getRentalUnitDetail, updateRentalUnit } from '@/lib/rental-server';
import { currentBillingPeriod } from '@/lib/rentals';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await requireApiAccess(request, 'rentals');
  if (session instanceof NextResponse) return session;
  const ownerId = await rentalOwnerId(session);
  const { searchParams } = new URL(request.url);
  const period = searchParams.get('period') || currentBillingPeriod();
  const leaseId = searchParams.get('leaseId') || undefined;
  const detail = await getRentalUnitDetail(params.id, ownerId, period, leaseId ? { leaseId } : undefined);
  if (!detail) return NextResponse.json({ error: 'Unit not found' }, { status: 404 });
  return NextResponse.json(detail);
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await requireApiAccess(request, 'rentals');
  if (session instanceof NextResponse) return session;
  const denied = denyReadOnlyWrite(session, 'rentals', request.method);
  if (denied) return denied;
  const ownerId = await rentalOwnerId(session);
  try {
    if (!await getRentalUnit(params.id, ownerId)) {
      return NextResponse.json({ error: 'Unit not found' }, { status: 404 });
    }
    const body = await request.json();
    const unit = await updateRentalUnit(params.id, ownerId, body);
    return NextResponse.json({ unit });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update rental unit';
    const status = message === 'Tenant name is required' ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
