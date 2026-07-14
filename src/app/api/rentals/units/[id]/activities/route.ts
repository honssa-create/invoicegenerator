import { NextResponse } from 'next/server';
import { denyReadOnlyWrite, requireApiAccess } from '@/lib/api-guard';
import { rentalOwnerId } from '@/lib/org-server';
import { getRentalActivities, logRentalActivity } from '@/lib/rental-server';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await requireApiAccess(request, 'rentals');
  if (session instanceof NextResponse) return session;
  const activities = getRentalActivities(Number(params.id), rentalOwnerId(session.userId));
  return NextResponse.json({ activities });
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await requireApiAccess(request, 'rentals');
  if (session instanceof NextResponse) return session;
  const denied = denyReadOnlyWrite(session, 'rentals', request.method);
  if (denied) return denied;
  const ownerId = rentalOwnerId(session.userId);
  try {
    const { action, note, rentRecordId } = await request.json();
    if (!action) return NextResponse.json({ error: 'Action is required' }, { status: 400 });
    logRentalActivity(ownerId, Number(params.id), action, note, rentRecordId || null);
    const activities = getRentalActivities(Number(params.id), ownerId);
    return NextResponse.json({ activities });
  } catch {
    return NextResponse.json({ error: 'Failed to log activity' }, { status: 500 });
  }
}
