import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getDataOwnerId } from '@/lib/org-server';
import { listMatchCandidates } from '@/lib/reconciliation-server';

/** Lazy-loaded unpaid invoice candidates for manual match UI. */
export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ownerId = await getDataOwnerId(session);
  const url = new URL(request.url);
  const q = url.searchParams.get('q') || undefined;
  const candidates = await listMatchCandidates(ownerId, q);
  return NextResponse.json({ candidates });
}
