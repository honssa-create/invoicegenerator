import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { denyReadOnlyWrite } from '@/lib/api-guard';
import { getDataOwnerId } from '@/lib/org-server';
import { getReconciliationRecord, unlinkRecord } from '@/lib/reconciliation-server';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const denied = denyReadOnlyWrite(session, 'reconciliation', request.method);
  if (denied) return denied;

  const recordId = Number(params.id);
  if (!Number.isFinite(recordId)) {
    return NextResponse.json({ error: 'Invalid record id' }, { status: 400 });
  }

  const ownerId = await getDataOwnerId(session);
  const existing = await getReconciliationRecord(ownerId, recordId);
  if (!existing) return NextResponse.json({ error: 'Record not found' }, { status: 404 });
  if (existing.status !== 'Matched') {
    return NextResponse.json({ error: 'Only matched records can be unlinked' }, { status: 400 });
  }

  const updated = await unlinkRecord(ownerId, recordId, session.name);
  return NextResponse.json({ record: updated });
}
