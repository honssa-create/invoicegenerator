import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getInventorySlice, resolveKitchenOwnerUserId } from '@/lib/kitchen-server';
import { parseNestieeDateFilterType } from '@/lib/nestiee-order-demand';

function isYmd(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const dateStartRaw = url.searchParams.get('dateStart')?.trim() || '';
  const dateEndRaw = url.searchParams.get('dateEnd')?.trim() || '';
  const dateStart = isYmd(dateStartRaw) ? dateStartRaw : '';
  const dateEnd = isYmd(dateEndRaw) ? dateEndRaw : '';
  const dateFilterType = parseNestieeDateFilterType(url.searchParams.get('dateFilterType'));

  const ownerId = await resolveKitchenOwnerUserId();
  const inventory = await getInventorySlice(ownerId, {
    dateStart,
    dateEnd,
    dateFilterType,
  });
  return NextResponse.json({ inventory });
}
