import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getDataOwnerId } from '@/lib/org-server';
import { listMatchCandidates, listReconciliationRecords } from '@/lib/reconciliation-server';
import { yedpayConfigured } from '@/lib/yedpay';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ownerId = await getDataOwnerId(session.userId);
  const url = new URL(request.url);
  const candidateSearch = url.searchParams.get('q') || undefined;
  const records = await listReconciliationRecords(ownerId);

  const pendingHigh = records.filter((r) => r.status === 'Pending Approval' && r.confidence === 'high');
  const pendingMedium = records.filter((r) => r.status === 'Pending Approval' && r.confidence === 'medium');

  const summary = {
    total: records.length,
    matched: records.filter((r) => r.status === 'Matched').length,
    unmatched: records.filter((r) => r.status === 'Unmatched').length,
    discrepancy: records.filter((r) => r.status === 'Discrepancy').length,
    pendingApproval: records.filter((r) => r.status === 'Pending Approval').length,
    pendingHigh: pendingHigh.length,
    pendingMedium: pendingMedium.length,
    grossTotal: records.reduce((s, r) => s + r.gross_amount, 0),
    netTotal: records.reduce((s, r) => s + r.net_amount, 0),
    feeTotal: records.reduce((s, r) => s + r.transaction_fee, 0),
  };

  return NextResponse.json({
    records,
    summary,
    candidates: await listMatchCandidates(ownerId, candidateSearch),
    yedpayConfigured: await yedpayConfigured(ownerId),
  });
}
