import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getDataOwnerId } from '@/lib/org-server';
import { getSyncState } from '@/lib/hub-server';
import { isQuickBooksConnected, quickbooksConfigured } from '@/lib/hub-sync';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ownerId = getDataOwnerId(session.userId);
  return NextResponse.json({
    configured: quickbooksConfigured(ownerId),
    connected: isQuickBooksConnected(ownerId),
    last_synced_at: getSyncState(ownerId, 'quickbooks', 'invoices'),
  });
}
