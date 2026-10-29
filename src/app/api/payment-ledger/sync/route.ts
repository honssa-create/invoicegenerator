import { NextResponse } from 'next/server';
import { denyReadOnlyWrite } from '@/lib/api-guard';
import { getSessionFromRequest } from '@/lib/auth';
import { getDataOwnerId } from '@/lib/org-server';
import { syncPaymentLedger } from '@/lib/payment-ledger-server';

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const denied = denyReadOnlyWrite(session, 'payment_ledger', request.method);
  if (denied) return denied;

  try {
    const ownerId = await getDataOwnerId(session);
    const result = await syncPaymentLedger(ownerId);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Payment ledger sync failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
