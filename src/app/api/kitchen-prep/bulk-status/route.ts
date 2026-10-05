import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { bulkSetPrepOrderStatus } from '@/lib/kitchen-prep-server';
import { PREP_STATUSES, type PrepStatus } from '@/lib/kitchen-prep';

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const { ids, status } = body as { ids?: unknown; status?: unknown };
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'No prep order ids provided' }, { status: 400 });
    }
    if (typeof status !== 'string' || !(PREP_STATUSES as readonly string[]).includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    if (status === 'completed') {
      return NextResponse.json(
        { error: 'Use 完成炖製 on each order to record yield and stock' },
        { status: 400 },
      );
    }

    const result = await bulkSetPrepOrderStatus(ids as number[], status as PrepStatus);
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Bulk status update failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
