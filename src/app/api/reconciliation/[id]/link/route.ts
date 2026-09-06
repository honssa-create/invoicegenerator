import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { denyReadOnlyWrite } from '@/lib/api-guard';
import { getDataOwnerId } from '@/lib/org-server';
import { normalizePaymentSlot } from '@/lib/orders';
import { getReconciliationRecord, linkRecordToOrder } from '@/lib/reconciliation-server';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const denied = denyReadOnlyWrite(session, 'reconciliation', request.method);
  if (denied) return denied;

  const recordId = Number(params.id);
  if (!Number.isFinite(recordId)) {
    return NextResponse.json({ error: 'Invalid record id' }, { status: 400 });
  }

  let body: { order_id?: number; payment_slot?: number } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const orderId = Number(body.order_id);
  if (!Number.isFinite(orderId) || orderId <= 0) {
    return NextResponse.json({ error: 'order_id is required' }, { status: 400 });
  }

  const paymentSlot = normalizePaymentSlot(body.payment_slot);

  const ownerId = await getDataOwnerId(session);
  const existing = await getReconciliationRecord(ownerId, recordId);
  if (!existing) return NextResponse.json({ error: 'Record not found' }, { status: 404 });
  if (existing.status === 'Matched') {
    return NextResponse.json({ error: 'Record is already matched' }, { status: 400 });
  }

  const updated = await linkRecordToOrder(ownerId, recordId, orderId, session.name, paymentSlot);
  if (!updated || updated.status !== 'Matched') {
    return NextResponse.json({ error: 'Could not link — order not found' }, { status: 400 });
  }

  return NextResponse.json({ record: updated });
}
