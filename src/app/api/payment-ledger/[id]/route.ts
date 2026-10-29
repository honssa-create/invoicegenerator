import { NextResponse } from 'next/server';
import { denyReadOnlyWrite } from '@/lib/api-guard';
import { getSessionFromRequest } from '@/lib/auth';
import { getDataOwnerId } from '@/lib/org-server';
import { isPaymentLedgerCategory } from '@/lib/payment-ledger';
import { updatePaymentLedgerCategory } from '@/lib/payment-ledger-server';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const denied = denyReadOnlyWrite(session, 'payment_ledger', request.method);
  if (denied) return denied;

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  let category = '';
  try {
    const body = (await request.json()) as { category?: unknown };
    category = typeof body.category === 'string' ? body.category : '';
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  if (!isPaymentLedgerCategory(category)) {
    return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
  }

  const ownerId = await getDataOwnerId(session);
  const entry = await updatePaymentLedgerCategory(ownerId, id, category);
  if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ entry });
}
