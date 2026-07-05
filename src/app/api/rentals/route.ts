import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { createRentalUnit, listRentalDashboard } from '@/lib/rental-server';
import { currentBillingPeriod } from '@/lib/rentals';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const period = searchParams.get('period') || currentBillingPeriod();
  return NextResponse.json(listRentalDashboard(session.userId, period));
}

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await request.json();
    const unit = createRentalUnit(session.userId, body);
    return NextResponse.json({ unit }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to create rental unit' }, { status: 500 });
  }
}
