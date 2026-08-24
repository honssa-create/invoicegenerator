import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/api-guard';
import { rentalOwnerId } from '@/lib/org-server';
import { deleteRentalLease } from '@/lib/rental-lease-server';
import { logRentalActivity } from '@/lib/rental-server';

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const session = await requireApiAdmin(_request);
  if (session instanceof NextResponse) return session;

  const ownerId = await rentalOwnerId(session);
  const result = await deleteRentalLease(params.id, ownerId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  await logRentalActivity(
    ownerId,
    result.unitId,
    'Lease Record Deleted 租約紀錄已刪除',
    result.tenantName,
  );

  return NextResponse.json({ ok: true, unitId: result.unitId });
}
