import { NextResponse } from 'next/server';
import { denyReadOnlyWrite, requireApiAccess } from '@/lib/api-guard';
import { rentalOwnerId } from '@/lib/org-server';
import { endRentalContract, unitOutstandingTotal } from '@/lib/rental-lease-server';
import { logRentalActivity } from '@/lib/rental-server';
import { formatMoney } from '@/lib/rentals';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await requireApiAccess(request, 'rentals');
  if (session instanceof NextResponse) return session;
  const denied = denyReadOnlyWrite(session, 'rentals', request.method);
  if (denied) return denied;

  const ownerId = rentalOwnerId(session.userId);
  const unitId = Number(params.id);
  const body = await request.json();

  try {
    const outstanding = unitOutstandingTotal(unitId, ownerId);
    if (outstanding > 0 && !body.forceEnd) {
      return NextResponse.json({
        error: `Outstanding balance ${formatMoney(outstanding)} — settle or pass forceEnd: true`,
        outstanding,
      }, { status: 400 });
    }

    const result = endRentalContract(ownerId, unitId, {
      actualEndDate: body.actualEndDate,
      endReason: body.endReason,
      depositRefund: body.depositRefund,
      depositDeductions: body.depositDeductions,
      endNotes: body.endNotes,
      startNewLease: body.startNewLease,
    });

    logRentalActivity(
      ownerId, unitId, 'Contract Ended',
      `${result.endedLease.tenantName} · ${result.endedLease.actualEndDate || result.endedLease.leaseEndDate}`,
    );
    if (result.newLease) {
      logRentalActivity(ownerId, unitId, 'New Lease Started', result.newLease.tenantName);
    }

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to end contract' },
      { status: 400 },
    );
  }
}
