import { NextResponse } from 'next/server';
import { parseEntityId } from '@/lib/part-time';
import { requirePartTime } from '@/lib/part-time-guard';
import { readSignaturePng } from '@/lib/part-time-server';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const access = await requirePartTime(request);
  if (access instanceof NextResponse) return access;
  const recordId = parseEntityId(params.id);
  if (!recordId) return NextResponse.json({ error: 'Record not found 找不到紀錄' }, { status: 404 });
  const bytes = await readSignaturePng(access.ownerId, recordId);
  if (!bytes) return NextResponse.json({ error: 'Signature not found 找不到簽名' }, { status: 404 });
  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'private, max-age=86400',
    },
  });
}
