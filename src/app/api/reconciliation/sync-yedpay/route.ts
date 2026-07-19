import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { denyReadOnlyWrite } from '@/lib/api-guard';
import { getDataOwnerId } from '@/lib/org-server';
import { syncYedpayForUser } from '@/lib/reconciliation-server';

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const denied = denyReadOnlyWrite(session, 'reconciliation', request.method);
  if (denied) return denied;

  try {
    const ownerId = getDataOwnerId(session.userId);
    const result = await syncYedpayForUser(ownerId);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Yedpay sync failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
