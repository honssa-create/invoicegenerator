import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getDataOwnerId } from '@/lib/org-server';
import { listReconciliationPage, parseReconciliationListQuery } from '@/lib/reconciliation-server';
import { yedpayConfigured } from '@/lib/yedpay';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ownerId = await getDataOwnerId(session);
  const query = parseReconciliationListQuery(new URL(request.url).searchParams);
  const page = await listReconciliationPage(ownerId, query);

  return NextResponse.json({
    records: page.records,
    total: page.total,
    limit: page.limit,
    offset: page.offset,
    summary: page.summary,
    linkRelatedTotal: page.linkRelatedTotal,
    yedpayConfigured: await yedpayConfigured(ownerId),
  });
}
