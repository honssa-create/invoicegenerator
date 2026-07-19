import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getDataOwnerId } from '@/lib/org-server';
import { resolveHubOwnerUserId } from '@/lib/hub-server';
import { syncAllWooStores, syncQuickBooksInvoices, isQuickBooksConnected } from '@/lib/hub-sync';
import { getWooStoreConfigs } from '@/lib/woocommerce';

async function runHubSyncForOwner(ownerId: number) {
  const result: {
    user_id: number;
    woocommerce?: Awaited<ReturnType<typeof syncAllWooStores>>;
    quickbooks?: Awaited<ReturnType<typeof syncQuickBooksInvoices>>;
    errors: string[];
  } = { user_id: ownerId, errors: [] };

  if (getWooStoreConfigs(ownerId).length) {
    try {
      result.woocommerce = await syncAllWooStores(ownerId);
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : 'WooCommerce sync failed');
    }
  }

  if (isQuickBooksConnected(ownerId)) {
    try {
      result.quickbooks = await syncQuickBooksInvoices(ownerId);
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : 'QuickBooks sync failed');
    }
  }

  return result;
}

async function handle(request: Request) {
  const authHeader = request.headers.get('authorization') || '';
  const cronSecret = process.env.CRON_SECRET;

  let ownerId: number;
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    ownerId = resolveHubOwnerUserId();
  } else {
    const session = await getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    ownerId = getDataOwnerId(session.userId);
  }

  const result = await runHubSyncForOwner(ownerId);
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}
