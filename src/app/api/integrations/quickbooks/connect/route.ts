import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getDataOwnerId } from '@/lib/org-server';
import { getQuickBooksAuthUrl } from '@/lib/hub-sync';
import { getQuickBooksCredentials } from '@/lib/integration-settings-server';
import { getPublicOrigin } from '@/lib/request-origin';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ownerId = await getDataOwnerId(session);
  const savedRedirectUri = (await getQuickBooksCredentials(ownerId)).redirect_uri;
  const origin = getPublicOrigin(request, { savedRedirectUri });
  const url = await getQuickBooksAuthUrl(ownerId, origin);
  return NextResponse.redirect(url);
}
