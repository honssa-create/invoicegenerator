import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import {
  loadKitchenWidgetsForRequest,
  resolveKitchenOwnerUserId,
} from '@/lib/kitchen-widgets-server';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ownerId = await resolveKitchenOwnerUserId();
  try {
    const payload = await loadKitchenWidgetsForRequest(ownerId, new URL(request.url).searchParams);
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json({ error: 'Failed to load kitchen widgets' }, { status: 500 });
  }
}
