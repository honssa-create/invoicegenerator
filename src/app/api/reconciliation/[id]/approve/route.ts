import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { denyReadOnlyWrite } from '@/lib/api-guard';
import { getDataOwnerId } from '@/lib/org-server';
import { approveRecord, getReconciliationRecord } from '@/lib/reconciliation-server';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const denied = denyReadOnlyWrite(session, 'reconciliation', request.method);
  if (denied) return denied;

  const recordId = Number(params.id);
  if (!Number.isFinite(recordId)) {
    return NextResponse.json({ error: 'Invalid record id' }, { status: 400 });
  }

  let body: { invoice_id?: number } = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const ownerId = await getDataOwnerId(session);
  const existing = await getReconciliationRecord(ownerId, recordId);
  if (!existing) return NextResponse.json({ error: 'Record not found' }, { status: 404 });
  if (existing.status === 'Matched') {
    return NextResponse.json({ error: 'Record is already matched' }, { status: 400 });
  }

  const invoiceOverride =
    body.invoice_id !== undefined && body.invoice_id !== null ? Number(body.invoice_id) : null;
  if (invoiceOverride !== null && !Number.isFinite(invoiceOverride)) {
    return NextResponse.json({ error: 'Invalid invoice_id' }, { status: 400 });
  }

  const updated = await approveRecord(ownerId, recordId, session.name, invoiceOverride);
  if (!updated || updated.status !== 'Matched') {
    return NextResponse.json(
      { error: 'Could not approve — no suggested order/invoice. Use Manual Link or Relink.' },
      { status: 400 }
    );
  }

  return NextResponse.json({ record: updated });
}
