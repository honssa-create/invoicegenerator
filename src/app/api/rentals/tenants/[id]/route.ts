import { NextResponse } from 'next/server';
import { requireApiAccess } from '@/lib/api-guard';
import { getTenantLedgerDetail } from '@/lib/rental-ledger-server';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await requireApiAccess(request, 'rentals');
  if (session instanceof NextResponse) return session;
  const detail = getTenantLedgerDetail(params.id, session.userId);
  if (!detail) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  return NextResponse.json(detail);
}
