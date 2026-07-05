import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { sendRentInvoice } from '@/lib/rental-server';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
