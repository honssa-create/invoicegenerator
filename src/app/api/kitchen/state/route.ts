import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getDataOwnerId } from '@/lib/org-server';
import { getState } from '@/lib/kitchen-server';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ownerId = await getDataOwnerId(session.userId);
  const state = await getState(ownerId, { isAdmin: session.role === 'admin' });
  return NextResponse.json({ state });
}
