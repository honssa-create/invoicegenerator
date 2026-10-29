import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getDataOwnerId } from '@/lib/org-server';
import { listPaymentLedger, paymentLedgerSyncStatus } from '@/lib/payment-ledger-server';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ownerId = await getDataOwnerId(session);
  const [entries, sync] = await Promise.all([
    listPaymentLedger(ownerId),
    paymentLedgerSyncStatus(ownerId),
  ]);
  return NextResponse.json({ entries, sync });
}
