import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getDataOwnerId } from '@/lib/org-server';
import { localDateYmd } from '@/lib/orders';
import { parseNestieeDateFilterType } from '@/lib/nestiee-order-demand';
import { countNestieeOrderStatusCounts } from '@/lib/nestiee-order-status-counts-server';

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
  const todayRaw = url.searchParams.get('today')?.trim() || '';
  const today = isYmd(todayRaw) ? todayRaw : localDateYmd();

  const ownerId = await getDataOwnerId(session);
  try {
    const counts = await countNestieeOrderStatusCounts(ownerId, {
      dateStart,
      dateEnd,
      dateFilterType,
      today,
    });
    return NextResponse.json({ counts });
  } catch {
    return NextResponse.json({ error: 'Failed to load Nestiee status counts' }, { status: 500 });
  }
}
