import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { denyReadOnlyWrite } from '@/lib/api-guard';
import { getDataOwnerId } from '@/lib/org-server';
import { syncQuickBooksInvoices, isQuickBooksConnected } from '@/lib/hub-sync';

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const denied = denyReadOnlyWrite(session, 'order_hub', request.method);
  if (denied) return denied;

  const ownerId = getDataOwnerId(session.userId);
  if (!isQuickBooksConnected(ownerId)) {
    return NextResponse.json({ error: 'QuickBooks is not connected. Connect OAuth first.' }, { status: 400 });
  }

  try {
    const result = await syncQuickBooksInvoices(ownerId);
    return NextResponse.json({ result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'QuickBooks sync failed' },
      { status: 500 }
    );
  }
}
