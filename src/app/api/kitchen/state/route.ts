import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { resolveKitchenOwnerUserId, getState } from '@/lib/kitchen-server';
import type { KitchenState } from '@/lib/kitchen';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const lite = new URL(request.url).searchParams.get('lite') === '1';
  const ownerId = await resolveKitchenOwnerUserId();
  const state = await getState(ownerId, {
    isAdmin: session.role === 'admin',
    includeMovements: !lite,
  });

  if (!lite) {
    return NextResponse.json({ state });
  }

  const { catalog: _catalog, formulas: _formulas, movements: _movements, ...operational } = state;
  return NextResponse.json({ state: operational as Omit<KitchenState, 'catalog' | 'formulas' | 'movements'> });
}
