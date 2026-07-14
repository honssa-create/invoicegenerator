import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { currentBillingPeriod } from '@/lib/rentals';
import { runRentalInvoiceDispatch } from '@/lib/rental-server';

async function handle(request: Request) {
  const { searchParams } = new URL(request.url);
  const period = searchParams.get('period') || currentBillingPeriod();
  const authHeader = request.headers.get('authorization') || '';
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return NextResponse.json(await runRentalInvoiceDispatch(null, period));
  }

  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(await runRentalInvoiceDispatch(session.userId, period));
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
