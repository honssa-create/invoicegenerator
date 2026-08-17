import { NextResponse } from 'next/server';
import { denyReadOnlyWrite, requireApiAccess } from '@/lib/api-guard';
import { rentalOwnerId } from '@/lib/org-server';
import { ensureRentRecordForUnit } from '@/lib/rental-server';
import { currentBillingPeriod } from '@/lib/rentals';

/** Materialize the billing-period row for a unit (write path for virtual id=0 cards). */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await requireApiAccess(request, 'rentals');
  if (session instanceof NextResponse) return session;
  const denied = denyReadOnlyWrite(session, 'rentals', request.method);
  if (denied) return denied;

  const ownerId = await rentalOwnerId(session);
  const { searchParams } = new URL(request.url);
  let period = searchParams.get('period') || '';
  if (!period) {
    try {
      const body = await request.json();
      if (typeof body?.period === 'string') period = body.period;
    } catch {
      /* empty body OK */
    }
  }
  if (!period) period = currentBillingPeriod();

  const record = await ensureRentRecordForUnit(params.id, ownerId, period);
  if (!record) return NextResponse.json({ error: 'Unit not found' }, { status: 404 });
  return NextResponse.json({ record });
}
