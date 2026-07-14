import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { createBatch, getState } from '@/lib/kitchen-server';
import { FLAVORS, CAPACITIES } from '@/lib/kitchen';

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    if (!FLAVORS.includes(body.flavor) || !CAPACITIES.includes(body.capacity)) {
      return NextResponse.json({ error: 'Invalid flavor or capacity' }, { status: 400 });
    }
    if (!Number(body.bottle_count) || Number(body.bottle_count) < 1) {
      return NextResponse.json({ error: 'Enter a batch bottle count' }, { status: 400 });
    }
    const batch = createBatch(session.userId, {
      flavor: body.flavor,
      capacity: body.capacity,
      brewing_date: body.brewing_date,
      bottle_count: Number(body.bottle_count),
    });
    return NextResponse.json({ batch, state: getState(session.userId) }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to create batch' }, { status: 500 });
  }
}
