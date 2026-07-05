import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getRentalUnit, updateRentalUnit } from '@/lib/rental-server';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
