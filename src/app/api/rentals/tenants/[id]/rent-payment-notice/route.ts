import { NextResponse } from 'next/server';
import { requireApiAccess } from '@/lib/api-guard';
import { buildRentPaymentNoticeMatrix } from '@/lib/rental-ledger-server';
import { currentBillingPeriod } from '@/lib/rentals';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await requireApiAccess(request, 'rentals');
  if (session instanceof NextResponse) return session;
  const { searchParams } = new URL(request.url);
  const period = searchParams.get('period') || currentBillingPeriod();
  const from = searchParams.get('from') || undefined;
  const matrix = buildRentPaymentNoticeMatrix(params.id, session.userId, period, from);
  if (!matrix) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  return NextResponse.json(matrix);
}
