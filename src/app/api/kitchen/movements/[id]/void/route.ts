import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getDataOwnerId } from '@/lib/org-server';
import { voidMovement, getState } from '@/lib/kitchen-server';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ownerId = await getDataOwnerId(session.userId);
  const movementId = Number(params.id);
  if (!movementId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  try {
    const result = await voidMovement(ownerId, session.userId, movementId, session.role === 'admin');
    if (result.error) {
      const status = result.error.includes('Only admin') ? 403 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }
    const state = await getState(ownerId, { isAdmin: session.role === 'admin' });
    return NextResponse.json({ state });
  } catch {
    return NextResponse.json({ error: 'Failed to void movement' }, { status: 500 });
  }
}
