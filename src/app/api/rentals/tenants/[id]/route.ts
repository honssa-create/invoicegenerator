import { NextResponse } from 'next/server';
import { denyReadOnlyWrite, requireApiAccess } from '@/lib/api-guard';
import { rentalOwnerId } from '@/lib/org-server';
import { getTenantLedgerDetail, updateRentalTenant } from '@/lib/rental-ledger-server';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await requireApiAccess(request, 'rentals');
  if (session instanceof NextResponse) return session;
  const ownerId = rentalOwnerId(session.userId);
  const detail = getTenantLedgerDetail(params.id, ownerId);
  if (!detail) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  return NextResponse.json(detail);
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await requireApiAccess(request, 'rentals');
  if (session instanceof NextResponse) return session;
  const denied = denyReadOnlyWrite(session, 'rentals', request.method);
  if (denied) return denied;
  const ownerId = rentalOwnerId(session.userId);
  try {
    const body = await request.json();
    const tenant = updateRentalTenant(params.id, ownerId, body);
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    return NextResponse.json({ tenant });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to update tenant';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
