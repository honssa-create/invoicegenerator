import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getOpenOrdersSlice, resolveKitchenOwnerUserId } from '@/lib/kitchen-server';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ownerId = await resolveKitchenOwnerUserId();
  const orders = await getOpenOrdersSlice(ownerId);
  return NextResponse.json({ orders });
}
