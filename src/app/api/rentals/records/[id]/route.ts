import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getRentRecord, updateRentRecordUtilities } from '@/lib/rental-server';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    if (!getRentRecord(params.id, session.userId)) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    }
    const body = await request.json();
    const record = updateRentRecordUtilities(params.id, session.userId, {
      waterFee: body.waterFee !== undefined ? Number(body.waterFee) : undefined,
      electricityFee: body.electricityFee !== undefined ? Number(body.electricityFee) : undefined,
      customInvoiceNote: body.customInvoiceNote,
    });
    return NextResponse.json({ record });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to update record';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
