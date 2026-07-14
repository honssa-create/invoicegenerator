import { NextResponse } from 'next/server';
import { denyReadOnlyWrite, requireApiAccess } from '@/lib/api-guard';
import { rentalOwnerId } from '@/lib/org-server';
import { allocatePayment } from '@/lib/rental-ledger-server';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await requireApiAccess(request, 'rentals');
  if (session instanceof NextResponse) return session;
  const denied = denyReadOnlyWrite(session, 'rentals', request.method);
  if (denied) return denied;
  try {
    const body = await request.json();
    const allocations = Array.isArray(body.allocations) ? body.allocations : [];
    if (!allocations.length) {
      return NextResponse.json({ error: 'allocations array required' }, { status: 400 });
    }
    const result = allocatePayment(
      params.id,
      rentalOwnerId(session.userId),
      allocations.map((a: { chargeItemId: number; amount: number }) => ({
        chargeItemId: Number(a.chargeItemId),
        amount: Number(a.amount),
      })),
    );
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Allocation failed' }, { status: 400 });
  }
}
