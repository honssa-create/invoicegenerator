import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { denyReadOnlyWrite } from '@/lib/api-guard';
import { getDataOwnerId } from '@/lib/org-server';
import { approveAllHighConfidence } from '@/lib/reconciliation-server';

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const denied = denyReadOnlyWrite(session, 'reconciliation', request.method);
  if (denied) return denied;

  const ownerId = await getDataOwnerId(session.userId);
  const result = await approveAllHighConfidence(ownerId, session.name);
  return NextResponse.json(result);
}
