import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { resolveKitchenOwnerUserId, voidMovement } from '@/lib/kitchen-server';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ownerId = await resolveKitchenOwnerUserId();
  const movementId = Number(params.id);
  if (!movementId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  try {
    const result = await voidMovement(ownerId, session.userId, movementId, session.role === 'admin');
    if (result.error) {
      const status = result.error.includes('Only admin') ? 403 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }
    return NextResponse.json({ state: result.state });
  } catch {
    return NextResponse.json({ error: 'Failed to void movement' }, { status: 500 });
  }
}
