import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getDataOwnerId } from '@/lib/org-server';
import { makeGiftBox, getState } from '@/lib/kitchen-server';

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ownerId = await getDataOwnerId(session);

  try {
    const body = await request.json();
    const consumeOverrides =
      body.consumeOverrides && typeof body.consumeOverrides === 'object' && !Array.isArray(body.consumeOverrides)
        ? (body.consumeOverrides as Record<string, number>)
        : undefined;
    const result = await makeGiftBox(ownerId, session.userId, {
      boxType: String(body.boxType || ''),
      quantity: Number(body.quantity),
      consumeOverrides,
    });
    if (result.error) {
      return NextResponse.json(
        {
          error: result.error,
          finished_shortfalls: result.finished_shortfalls || [],
        },
        { status: 400 }
      );
    }
    const state = result.state || (await getState(ownerId, { isAdmin: session.role === 'admin' }));
    return NextResponse.json({ state });
  } catch {
    return NextResponse.json({ error: 'Failed to make gift box' }, { status: 500 });
  }
}
