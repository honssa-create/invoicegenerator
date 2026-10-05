import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { resolveKitchenOwnerUserId, getState } from '@/lib/kitchen-server';
import { loadKitchenCatalog } from '@/lib/kitchen-catalog-server';
import type { KitchenState } from '@/lib/kitchen';

/** Single round-trip for kitchen shell: operational state + catalog/formulas. */
export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const lite = params.get('lite') !== '0';
  const includeInventory = params.get('inventory') !== '0';
  const includeOrders = params.get('orders') !== '0';

  const ownerId = await resolveKitchenOwnerUserId();
  const [state, bundle] = await Promise.all([
    getState(ownerId, {
      isAdmin: session.role === 'admin',
      includeMovements: !lite,
      includeInventory,
      includeOrders,
    }),
    loadKitchenCatalog(ownerId),
  ]);

  if (!lite) {
    return NextResponse.json({
      state: { ...state, catalog: bundle.catalog, formulas: bundle.formulas },
      catalog: bundle.catalog,
      formulas: bundle.formulas,
    });
  }

  const { catalog: _c, formulas: _f, movements: _m, ...operational } = state;
  return NextResponse.json({
    state: operational as Omit<KitchenState, 'catalog' | 'formulas' | 'movements'>,
    catalog: bundle.catalog,
    formulas: bundle.formulas,
  });
}
