import { NextResponse } from 'next/server';
import { denyReadOnlyWrite, requireApiAccess } from '@/lib/api-guard';
import { rentalOwnerId } from '@/lib/org-server';
import { listRentalTenants } from '@/lib/rental-ledger-server';

export async function GET(request: Request) {
  const session = await requireApiAccess(request, 'rentals');
  if (session instanceof NextResponse) return session;
  return NextResponse.json({ tenants: listRentalTenants(rentalOwnerId(session.userId)) });
}

export async function POST(request: Request) {
  const session = await requireApiAccess(request, 'rentals');
  if (session instanceof NextResponse) return session;
  const denied = denyReadOnlyWrite(session, 'rentals', request.method);
  if (denied) return denied;
  return NextResponse.json({ error: 'Create tenants via unit lease form' }, { status: 400 });
}
