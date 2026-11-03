import { NextResponse } from 'next/server';
import { denyReadOnlyWrite } from '@/lib/api-guard';
import { getSessionFromRequest } from '@/lib/auth';
import { getDataOwnerId } from '@/lib/org-server';
import { isPaymentLedgerCategory, parsePaymentLedgerMethodInput } from '@/lib/payment-ledger';
import { updatePaymentLedgerCategory, updatePaymentLedgerMethod } from '@/lib/payment-ledger-server';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const denied = denyReadOnlyWrite(session, 'payment_ledger', request.method);
  if (denied) return denied;

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  let body: { category?: unknown; payment_method?: unknown };
  try {
    body = (await request.json()) as { category?: unknown; payment_method?: unknown };
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const hasCategory = Object.prototype.hasOwnProperty.call(body, 'category');
  const hasMethod = Object.prototype.hasOwnProperty.call(body, 'payment_method');
  if (!hasCategory && !hasMethod) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  if (hasCategory && !isPaymentLedgerCategory(body.category)) {
    return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
  }
  const method = hasMethod ? parsePaymentLedgerMethodInput(body.payment_method) : null;
  if (hasMethod && method == null) {
    return NextResponse.json({ error: 'Invalid payment method' }, { status: 400 });
  }

  const ownerId = await getDataOwnerId(session);
  let entry = null;
  if (hasCategory) {
    entry = await updatePaymentLedgerCategory(ownerId, id, body.category as string);
    if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (hasMethod) {
    entry = await updatePaymentLedgerMethod(ownerId, id, method as string);
    if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ entry });
}
