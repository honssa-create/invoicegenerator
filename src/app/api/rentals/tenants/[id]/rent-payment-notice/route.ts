import { NextResponse } from 'next/server';
import { requireApiAccess } from '@/lib/api-guard';
import { rentalOwnerId } from '@/lib/org-server';
import { buildRentPaymentNoticeMatrix } from '@/lib/rental-ledger-server';
import { currentBillingPeriod } from '@/lib/rentals';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await requireApiAccess(request, 'rentals');
  if (session instanceof NextResponse) return session;
  const ownerId = rentalOwnerId(session.userId);
  const { searchParams } = new URL(request.url);
  const targetPeriod =
    searchParams.get('target_period') ||
    searchParams.get('period') ||
    currentBillingPeriod();
  const from = searchParams.get('from') || undefined;
  const paidLookbackRaw = searchParams.get('paid_lookback');
  const paidLookbackMonths = paidLookbackRaw ? Number(paidLookbackRaw) : undefined;

  const matrix = buildRentPaymentNoticeMatrix(params.id, ownerId, targetPeriod, {
    fromPeriod: from,
    paidLookbackMonths: Number.isFinite(paidLookbackMonths) ? paidLookbackMonths : undefined,
  });
  if (!matrix) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  return NextResponse.json(matrix);
}
