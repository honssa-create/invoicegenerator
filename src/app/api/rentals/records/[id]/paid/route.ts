import { NextResponse } from 'next/server';
import { denyReadOnlyWrite, requireApiAccess } from '@/lib/api-guard';
import { rentalOwnerId } from '@/lib/org-server';
import { markRentPaid } from '@/lib/rental-server';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await requireApiAccess(request, 'rentals');
  if (session instanceof NextResponse) return session;
  const denied = denyReadOnlyWrite(session, 'rentals', request.method);
  if (denied) return denied;
  const ownerId = rentalOwnerId(session.userId);
  try {
    const body = await request.json();
    const result = await markRentPaid(params.id, ownerId, {
      autoSendReceiptEmail: body.autoSendReceiptEmail !== undefined ? Boolean(body.autoSendReceiptEmail) : undefined,
      note: body.note || null,
      paidDate: body.paidDate || null,
      amount: body.amount !== undefined && body.amount !== null ? Number(body.amount) : undefined,
    });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to mark paid';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
