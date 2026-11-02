import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { listCashflowMonth, parseCashflowListQuery } from '@/lib/cashflow-server';
import { getDataOwnerId } from '@/lib/org-server';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ownerId = await getDataOwnerId(session);
  const params = new URL(request.url).searchParams;
  const query = parseCashflowListQuery({
    month: params.get('month'),
    limit: params.get('limit'),
    offset: params.get('offset'),
  });
  return NextResponse.json(await listCashflowMonth(ownerId, query));
}
