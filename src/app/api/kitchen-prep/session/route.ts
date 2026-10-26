import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import {
  completePrepSession,
  resolveKitchenOwnerUserId,
  startPrepSession,
} from '@/lib/kitchen-prep-server';

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const action = body?.action;
    const ids = body?.ids;
    if (action !== 'start' && action !== 'complete') {
      return NextResponse.json({ error: 'action must be start or complete' }, { status: 400 });
    }
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'No prep order ids provided' }, { status: 400 });
    }

    const ownerId = await resolveKitchenOwnerUserId();
    const result =
      action === 'start'
        ? await startPrepSession(ownerId, ids as number[])
        : await completePrepSession(ownerId, session.userId, session.name, ids as number[]);

    const failed = 'error' in result && result.error && result.updated.length === 0;
    return NextResponse.json(result, { status: failed ? 400 : 200 });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Session update failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
