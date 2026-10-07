import { NextResponse } from 'next/server';
import { parseEntityId } from '@/lib/part-time';
import { requirePartTime } from '@/lib/part-time-guard';
import { clockIn } from '@/lib/part-time-server';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const access = await requirePartTime(request);
  if (access instanceof NextResponse) return access;
  const staffId = parseEntityId(params.id);
  if (!staffId) return NextResponse.json({ error: 'Staff not found 找不到員工' }, { status: 404 });
  const result = await clockIn(access.ownerId, staffId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ staff: result.data });
}
