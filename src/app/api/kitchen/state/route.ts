import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { resolveKitchenOwnerUserId, getState } from '@/lib/kitchen-server';
import type { KitchenState } from '@/lib/kitchen';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const lite = params.get('lite') === '1';
  const includeInventory = params.get('inventory') !== '0';
  const includeOrders = params.get('orders') !== '0';
  const ownerId = await resolveKitchenOwnerUserId();
  const state = await getState(ownerId, {
    isAdmin: session.role === 'admin',
    includeMovements: !lite,
    includeInventory,
    includeOrders,
  });

  if (!lite) {
    return NextResponse.json({ state });
  }

  const { catalog: _catalog, formulas: _formulas, movements: _movements, ...operational } = state;
  return NextResponse.json({ state: operational as Omit<KitchenState, 'catalog' | 'formulas' | 'movements'> });
}
