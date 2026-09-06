import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getInventorySlice, resolveKitchenOwnerUserId } from '@/lib/kitchen-server';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ownerId = await resolveKitchenOwnerUserId();
  const inventory = await getInventorySlice(ownerId);
  return NextResponse.json({ inventory });
}
