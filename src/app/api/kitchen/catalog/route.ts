import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getDataOwnerId } from '@/lib/org-server';
import { loadKitchenCatalog, saveKitchenCatalog } from '@/lib/kitchen-catalog-server';
import { invalidateKitchenSeedCache, getState } from '@/lib/kitchen-server';
import type { KitchenCatalog, KitchenFormulas } from '@/lib/kitchen-catalog';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ownerId = await getDataOwnerId(session);
  try {
    const bundle = await loadKitchenCatalog(ownerId);
    return NextResponse.json(bundle);
  } catch {
    return NextResponse.json({ error: 'Failed to load catalog' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Only admin can update kitchen catalog' }, { status: 403 });
  }

  const ownerId = await getDataOwnerId(session);
  try {
    const body = await request.json();
    const catalog = (body.catalog ?? null) as KitchenCatalog | null;
    const formulas = (body.formulas ?? null) as KitchenFormulas | null;
    const result = await saveKitchenCatalog(ownerId, true, { catalog, formulas });
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    invalidateKitchenSeedCache(ownerId);
    const state = await getState(ownerId, { isAdmin: true });
    return NextResponse.json({ catalog: result.bundle?.catalog, formulas: result.bundle?.formulas, state });
  } catch {
    return NextResponse.json({ error: 'Failed to save catalog' }, { status: 500 });
  }
}
