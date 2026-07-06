import { NextResponse } from 'next/server';
import { requireApiAccess } from '@/lib/api-guard';
import { rentalOwnerId } from '@/lib/org-server';
import { getTenantLedgerDetail } from '@/lib/rental-ledger-server';

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
