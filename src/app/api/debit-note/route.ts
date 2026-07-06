import { NextResponse } from 'next/server';
import { requireApiAccess } from '@/lib/api-guard';
import { rentalOwnerId } from '@/lib/org-server';
import { buildRentPaymentNoticeMatrix } from '@/lib/rental-ledger-server';
import { currentBillingPeriod, type DebitNoteMode } from '@/lib/rentals';

/**
 * Debit note pivot matrix API.
 * GET /api/debit-note?tenantId=1&targetPeriod=2026-06&mode=grouped|single&unitId=4
 */
export async function GET(request: Request) {
  const session = await requireApiAccess(request, 'rentals');
  if (session instanceof NextResponse) return session;
  const ownerId = rentalOwnerId(session.userId);
  const { searchParams } = new URL(request.url);

  const tenantId = searchParams.get('tenant_id') || searchParams.get('tenantId');
  if (!tenantId) {
    return NextResponse.json({ error: 'tenantId query parameter is required' }, { status: 400 });
  }

  const targetPeriod =
    searchParams.get('target_period') ||
    searchParams.get('targetPeriod') ||
    searchParams.get('period') ||
    currentBillingPeriod();

  const mode = (searchParams.get('mode') || 'grouped') as DebitNoteMode;
  const unitIdRaw = searchParams.get('unit_id') || searchParams.get('unitId');
  const unitId = unitIdRaw ? Number(unitIdRaw) : undefined;

  if (mode === 'single' && !unitId) {
    return NextResponse.json({ error: 'unitId is required when mode is single' }, { status: 400 });
  }

  const fromPeriod = searchParams.get('from') || searchParams.get('from_period') || undefined;
  const paidLookbackRaw = searchParams.get('paid_lookback') || searchParams.get('paidLookback');
  const paidLookbackMonths = paidLookbackRaw !== null && paidLookbackRaw !== ''
    ? Number(paidLookbackRaw)
    : undefined;

  try {
    const matrix = buildRentPaymentNoticeMatrix(Number(tenantId), ownerId, targetPeriod, {
      fromPeriod,
      paidLookbackMonths: Number.isFinite(paidLookbackMonths) ? paidLookbackMonths : undefined,
      mode,
      unitId,
    });

    if (!matrix) {
      return NextResponse.json({ error: 'Tenant or unit not found' }, { status: 404 });
    }

    return NextResponse.json(matrix);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to build debit note' },
      { status: 400 },
    );
  }
}
