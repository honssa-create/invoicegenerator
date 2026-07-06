import { NextResponse } from 'next/server';
import { denyReadOnlyWrite, requireApiAccess } from '@/lib/api-guard';
import { rentalOwnerId } from '@/lib/org-server';
import { getRentRecord, updateRentRecordUtilities } from '@/lib/rental-server';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await requireApiAccess(request, 'rentals');
  if (session instanceof NextResponse) return session;
  const denied = denyReadOnlyWrite(session, 'rentals', request.method);
  if (denied) return denied;
  const ownerId = rentalOwnerId(session.userId);
  try {
    if (!getRentRecord(params.id, ownerId)) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    }
    const body = await request.json();
    const record = updateRentRecordUtilities(params.id, ownerId, {
      baseRent: body.baseRent !== undefined ? Number(body.baseRent) : undefined,
      baseRentPeriodFrom: body.baseRentPeriodFrom,
      baseRentPeriodTo: body.baseRentPeriodTo,
      waterFee: body.waterFee !== undefined ? Number(body.waterFee) : undefined,
      electricityFee: body.electricityFee !== undefined ? Number(body.electricityFee) : undefined,
      waterPeriodFrom: body.waterPeriodFrom,
      waterPeriodTo: body.waterPeriodTo,
      electricityPeriodFrom: body.electricityPeriodFrom,
      electricityPeriodTo: body.electricityPeriodTo,
      customInvoiceNote: body.customInvoiceNote,
    });
    return NextResponse.json({ record });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to update record';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
