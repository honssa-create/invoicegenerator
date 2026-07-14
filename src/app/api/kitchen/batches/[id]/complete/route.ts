import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { completeBatch, getState } from '@/lib/kitchen-server';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const result = completeBatch(session.userId, params.id);
  if ('error' in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json({ ...result, state: getState(session.userId) });
}
