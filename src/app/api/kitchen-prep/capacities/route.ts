import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { resolveKitchenOwnerUserId } from '@/lib/kitchen-prep-server';
import { readKitchenCapacityOptions } from '@/lib/kitchen-catalog-server';

/** Capacity dropdown labels only (for New Prep form) — avoids loading the full prep list. */
export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ownerId = await resolveKitchenOwnerUserId();
  const capacities = await readKitchenCapacityOptions(ownerId);
  return NextResponse.json({
    capacities: capacities.map((c) => ({
      id: c.id,
      label: c.label,
      sortOrder: c.sortOrder,
    })),
  });
}
