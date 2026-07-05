import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getRentalActivities, logRentalActivity } from '@/lib/rental-server';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const activities = getRentalActivities(Number(params.id), session.userId);
  return NextResponse.json({ activities });
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { action, note, rentRecordId } = await request.json();
    if (!action) return NextResponse.json({ error: 'Action is required' }, { status: 400 });
    logRentalActivity(session.userId, Number(params.id), action, note, rentRecordId || null);
    const activities = getRentalActivities(Number(params.id), session.userId);
    return NextResponse.json({ activities });
  } catch {
    return NextResponse.json({ error: 'Failed to log activity' }, { status: 500 });
  }
}
