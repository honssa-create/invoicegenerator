import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getDataOwnerId } from '@/lib/org-server';
import { parsePaymentLedgerListQuery } from '@/lib/payment-ledger';
import { listPaymentLedger, paymentLedgerSyncStatus } from '@/lib/payment-ledger-server';
import { getPublicOrigin } from '@/lib/request-origin';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ownerId = await getDataOwnerId(session);
  const origin = getPublicOrigin(request);
  const params = new URL(request.url).searchParams;
  const query = parsePaymentLedgerListQuery({
    dateStart: params.get('dateStart'),
    dateEnd: params.get('dateEnd'),
    category: params.get('category'),
    q: params.get('q'),
    limit: params.get('limit'),
    offset: params.get('offset'),
  });
  const [page, sync] = await Promise.all([
    listPaymentLedger(ownerId, query),
    paymentLedgerSyncStatus(ownerId, origin),
  ]);
  return NextResponse.json({ ...page, sync });
}
