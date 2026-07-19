import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getDataOwnerId } from '@/lib/org-server';
import { getQuickBooksAuthUrl } from '@/lib/hub-sync';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ownerId = getDataOwnerId(session.userId);
  const origin = new URL(request.url).origin;
  const url = getQuickBooksAuthUrl(ownerId, origin);
  return NextResponse.redirect(url);
}
