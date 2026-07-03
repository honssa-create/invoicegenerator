import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getState } from '@/lib/kitchen-server';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ state: getState(session.userId) });
}
