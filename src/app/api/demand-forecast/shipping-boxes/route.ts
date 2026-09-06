import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { buildShippingBoxesForecast } from '@/lib/demand-forecast-server';
import { parseDemandForecastDateFilterType } from '@/lib/demand-forecast';

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
  const dateFilterType = parseDemandForecastDateFilterType(url.searchParams.get('dateFilterType'));

  try {
    const data = buildShippingBoxesForecast(session.userId, {
      dateStart,
      dateEnd,
      dateFilterType,
    });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Failed to load shipping boxes forecast' }, { status: 500 });
  }
}
