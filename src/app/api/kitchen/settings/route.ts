import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getDataOwnerId } from '@/lib/org-server';
import { setHolidayMode } from '@/lib/kitchen-server';

export async function PATCH(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Only admin can toggle holiday mode' }, { status: 403 });
  }

  const ownerId = await getDataOwnerId(session);
  try {
    const body = await request.json();
    const holidayMode = Boolean(body.holiday_mode ?? body.holidayMode);
    const result = await setHolidayMode(ownerId, true, holidayMode);
    if (result.error) return NextResponse.json({ error: result.error }, { status: 403 });
    return NextResponse.json({ state: result.state });
  } catch {
    return NextResponse.json({ error: 'Failed to update kitchen settings' }, { status: 500 });
  }
}
