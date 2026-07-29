import { NextResponse } from 'next/server';
import { requireApiAccess } from '@/lib/api-guard';
import { rentalOwnerId } from '@/lib/org-server';
import { buildRentPaymentNoticeForUnit, getTenantIdForUnit } from '@/lib/rental-ledger-server';
import { getRentalUnit } from '@/lib/rental-server';
import { currentBillingPeriod } from '@/lib/rentals';

/** Rent payment notice resolved from a unit — avoids confusing unit id with tenant id. */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await requireApiAccess(request, 'rentals');
  if (session instanceof NextResponse) return session;
  const ownerId = await rentalOwnerId(session.userId);
  const unit = await getRentalUnit(params.id, ownerId);
  if (!unit) return NextResponse.json({ error: 'Unit not found' }, { status: 404 });

  const tenantId = await getTenantIdForUnit(params.id, ownerId);
  if (!tenantId) {
    return NextResponse.json(
      { error: 'This unit has no linked tenant yet. Save the lease with a tenant name first.' },
      { status: 404 },
    );
  }

  const { searchParams } = new URL(request.url);
  const targetPeriod =
    searchParams.get('target_period') ||
    searchParams.get('period') ||
    currentBillingPeriod();
  const from = searchParams.get('from') || undefined;
  const paidLookbackRaw = searchParams.get('paid_lookback');
  const paidLookbackMonths = paidLookbackRaw ? Number(paidLookbackRaw) : undefined;

  const matrix = await buildRentPaymentNoticeForUnit(params.id, ownerId, targetPeriod, {
    fromPeriod: from,
    paidLookbackMonths: Number.isFinite(paidLookbackMonths) ? paidLookbackMonths : undefined,
  });
  if (!matrix) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  return NextResponse.json({ ...matrix, tenantId, unitId: unit.id });
}
