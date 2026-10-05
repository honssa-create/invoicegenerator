import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { resolveKitchenOwnerUserId, makeGiftBox } from '@/lib/kitchen-server';
import { parseBirdNestType } from '@/lib/kitchen-prep';

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ownerId = await resolveKitchenOwnerUserId();

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
      birdNestType: body.birdNestType != null ? parseBirdNestType(String(body.birdNestType)) : undefined,
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
    return NextResponse.json({ state: result.state });
  } catch {
    return NextResponse.json({ error: 'Failed to make gift box' }, { status: 500 });
  }
}
