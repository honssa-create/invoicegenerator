import { NextResponse } from 'next/server';
import { denyReadOnlyWrite, requireApiAccess } from '@/lib/api-guard';
import { sendRentInvoice } from '@/lib/rental-server';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await requireApiAccess(request, 'rentals');
  if (session instanceof NextResponse) return session;
  const denied = denyReadOnlyWrite(session, 'rentals', request.method);
  if (denied) return denied;
  try {
    const body = await request.json();
    const result = await sendRentInvoice(params.id, session.userId, {
      waterFee: body.waterFee !== undefined ? Number(body.waterFee) : undefined,
      electricityFee: body.electricityFee !== undefined ? Number(body.electricityFee) : undefined,
      baseRentPeriodFrom: body.baseRentPeriodFrom,
      baseRentPeriodTo: body.baseRentPeriodTo,
      waterPeriodFrom: body.waterPeriodFrom,
      waterPeriodTo: body.waterPeriodTo,
      electricityPeriodFrom: body.electricityPeriodFrom,
      electricityPeriodTo: body.electricityPeriodTo,
      note: body.note || null,
    });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to send invoice';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
