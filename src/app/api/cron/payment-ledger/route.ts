import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { listHubCronOwnerUserIds } from '@/lib/hub-server';
import { getDataOwnerId } from '@/lib/org-server';
import { syncPaymentLedger } from '@/lib/payment-ledger-server';

async function handle(request: Request) {
  const authHeader = request.headers.get('authorization') || '';
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    const ownerIds = await listHubCronOwnerUserIds();
    const results = [];
    for (const ownerId of ownerIds) {
      results.push(await syncPaymentLedger(ownerId));
    }
    return NextResponse.json({
      owners: ownerIds,
      results,
      errors: results.flatMap((result) => result.errors),
    });
  }

  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ownerId = await getDataOwnerId(session);
  const result = await syncPaymentLedger(ownerId);
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}
