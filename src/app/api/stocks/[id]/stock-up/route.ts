import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { resolveDataOwnerId } from '@/lib/org-server';
import { stockUp } from '@/lib/stocks-server';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const ownerId = await resolveDataOwnerId(session);
    const result = await stockUp(ownerId, id, Number(body.qty));
    if (result.error) {
      const status = result.error === 'Item not found' ? 404 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }
    return NextResponse.json({ item: result.item });
  } catch {
    return NextResponse.json({ error: 'Failed to stock up' }, { status: 500 });
  }
}
