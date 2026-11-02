import { NextResponse } from 'next/server';
import { listAccountingEntries, parseAccountingListQuery } from '@/lib/accounting-server';
import { getSessionFromRequest } from '@/lib/auth';
import { currentMonth } from '@/lib/cashflow';
import { getDataOwnerId } from '@/lib/org-server';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ownerId = await getDataOwnerId(session);
  const params = new URL(request.url).searchParams;
  const monthRaw = params.get('month');
  const query = parseAccountingListQuery({
    month: monthRaw == null || monthRaw === '' ? currentMonth() : monthRaw,
    pending: params.get('pending'),
    limit: params.get('limit'),
    offset: params.get('offset'),
  });
  const page = await listAccountingEntries(ownerId, query);
  return NextResponse.json(page);
}
