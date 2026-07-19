import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getDataOwnerId } from '@/lib/org-server';
import { listMatchCandidates, listReconciliationRecords } from '@/lib/reconciliation-server';
import { yedpayConfigured } from '@/lib/yedpay';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ownerId = getDataOwnerId(session.userId);
  const records = listReconciliationRecords(ownerId);

  const summary = {
    total: records.length,
    matched: records.filter((r) => r.status === 'Matched').length,
    unmatched: records.filter((r) => r.status === 'Unmatched').length,
    discrepancy: records.filter((r) => r.status === 'Discrepancy').length,
    grossTotal: records.reduce((s, r) => s + r.gross_amount, 0),
    netTotal: records.reduce((s, r) => s + r.net_amount, 0),
    feeTotal: records.reduce((s, r) => s + r.transaction_fee, 0),
  };

  return NextResponse.json({
    records,
    summary,
    candidates: listMatchCandidates(ownerId),
    yedpayConfigured: yedpayConfigured(),
  });
}
