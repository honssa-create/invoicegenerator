import { NextResponse } from 'next/server';
import { denyReadOnlyWrite, requireApiAccess } from '@/lib/api-guard';
import { rentalOwnerId } from '@/lib/org-server';
import { createRentalUnit, listRentalDashboard } from '@/lib/rental-server';
import { currentBillingPeriod } from '@/lib/rentals';

export async function GET(request: Request) {
  const session = await requireApiAccess(request, 'rentals');
  if (session instanceof NextResponse) return session;
  const ownerId = rentalOwnerId(session.userId);
  const { searchParams } = new URL(request.url);
  const period = searchParams.get('period') || currentBillingPeriod();
  return NextResponse.json(listRentalDashboard(ownerId, period));
}

export async function POST(request: Request) {
  const session = await requireApiAccess(request, 'rentals');
  if (session instanceof NextResponse) return session;
  const denied = denyReadOnlyWrite(session, 'rentals', request.method);
  if (denied) return denied;
  try {
    const body = await request.json();
    const unit = createRentalUnit(rentalOwnerId(session.userId), body);
    return NextResponse.json({ unit }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to create rental unit' }, { status: 500 });
  }
}
