import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { denyReadOnlyWrite } from '@/lib/api-guard';
import { getDataOwnerId } from '@/lib/org-server';
import { getReconciliationRecord, manualMatchRecord } from '@/lib/reconciliation-server';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const denied = denyReadOnlyWrite(session, 'reconciliation', request.method);
  if (denied) return denied;

  const recordId = Number(params.id);
  if (!Number.isFinite(recordId)) {
    return NextResponse.json({ error: 'Invalid record id' }, { status: 400 });
  }

  let body: { invoice_id?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const invoiceId = Number(body.invoice_id);
  if (!Number.isFinite(invoiceId)) {
    return NextResponse.json({ error: 'invoice_id is required' }, { status: 400 });
  }

  const ownerId = getDataOwnerId(session.userId);
  const existing = getReconciliationRecord(ownerId, recordId);
  if (!existing) return NextResponse.json({ error: 'Record not found' }, { status: 404 });
  if (existing.status === 'Matched') {
    return NextResponse.json({ error: 'Record is already matched' }, { status: 400 });
  }

  const updated = manualMatchRecord(ownerId, recordId, invoiceId, session.name);
  if (!updated) return NextResponse.json({ error: 'Could not match record' }, { status: 400 });

  return NextResponse.json({ record: updated });
}
