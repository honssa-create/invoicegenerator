import { NextResponse } from 'next/server';
import { parseEntityId } from '@/lib/part-time';
import { requirePartTime } from '@/lib/part-time-guard';
import { deleteRecord } from '@/lib/part-time-server';

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const access = await requirePartTime(request);
  if (access instanceof NextResponse) return access;
  const recordId = parseEntityId(params.id);
  if (!recordId) return NextResponse.json({ error: 'Record not found 找不到紀錄' }, { status: 404 });
  const removed = await deleteRecord(access.ownerId, recordId);
  if (!removed) return NextResponse.json({ error: 'Record not found 找不到紀錄' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
