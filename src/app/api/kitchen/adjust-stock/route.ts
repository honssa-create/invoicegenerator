import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getDataOwnerId } from '@/lib/org-server';
import { adjustStock } from '@/lib/kitchen-server';

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Only admin can adjust stock' }, { status: 403 });
  }

  const ownerId = await getDataOwnerId(session);
  try {
    const body = await request.json();
    const kind = body.kind as 'raw' | 'finished' | 'gift_box';
    const key = String(body.key || '');
    const quantity = Number(body.quantity);
    const result = await adjustStock(ownerId, session.userId, true, { kind, key, quantity });
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ state: result.state });
  } catch {
    return NextResponse.json({ error: 'Failed to adjust stock' }, { status: 500 });
  }
}
