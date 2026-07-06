import { NextResponse } from 'next/server';
import { requireApiAccess } from '@/lib/api-guard';
import { rentalOwnerId } from '@/lib/org-server';
import { buildRentPaymentNoticeMatrix } from '@/lib/rental-ledger-server';
import { currentBillingPeriod } from '@/lib/rentals';

/**
 * Tenant-scoped debit note / rent payment notice (multi-unit pivot matrix).
 * GET /api/debit-note?tenant_id=1&target_period=2026-06&paid_lookback=2&from=2026-02
 */
export async function GET(request: Request) {
  const session = await requireApiAccess(request, 'rentals');
  if (session instanceof NextResponse) return session;
  const ownerId = rentalOwnerId(session.userId);
  const { searchParams } = new URL(request.url);

  const tenantId = searchParams.get('tenant_id') || searchParams.get('tenantId');
  if (!tenantId) {
    return NextResponse.json({ error: 'tenant_id query parameter is required' }, { status: 400 });
  }

  const targetPeriod =
    searchParams.get('target_period') ||
    searchParams.get('targetPeriod') ||
    searchParams.get('period') ||
    currentBillingPeriod();

  const fromPeriod = searchParams.get('from') || searchParams.get('from_period') || undefined;
  const paidLookbackRaw = searchParams.get('paid_lookback') || searchParams.get('paidLookback');
  const paidLookbackMonths = paidLookbackRaw !== null && paidLookbackRaw !== ''
    ? Number(paidLookbackRaw)
    : undefined;

  const matrix = buildRentPaymentNoticeMatrix(Number(tenantId), ownerId, targetPeriod, {
    fromPeriod,
    paidLookbackMonths: Number.isFinite(paidLookbackMonths) ? paidLookbackMonths : undefined,
  });

  if (!matrix) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  }

  return NextResponse.json(matrix);
}
