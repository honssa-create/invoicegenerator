import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getDataOwnerId } from '@/lib/org-server';
import { resolveHubOwnerUserId } from '@/lib/hub-server';
import { syncAllWooStores, syncQuickBooksInvoices, syncClickUpTasks, isQuickBooksConnected } from '@/lib/hub-sync';
import { clickupConfigured } from '@/lib/integration-settings-server';
import { getWooStoreConfigs } from '@/lib/woocommerce';

async function runHubSyncForOwner(ownerId: number) {
  const result: {
    user_id: number;
    woocommerce?: Awaited<ReturnType<typeof syncAllWooStores>>;
    quickbooks?: Awaited<ReturnType<typeof syncQuickBooksInvoices>>;
    clickup?: Awaited<ReturnType<typeof syncClickUpTasks>>;
    errors: string[];
  } = { user_id: ownerId, errors: [] };

  const wooStores = await getWooStoreConfigs(ownerId);
  if (wooStores.length) {
    try {
      result.woocommerce = await syncAllWooStores(ownerId);
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : 'WooCommerce sync failed');
    }
  } else {
    result.errors.push(
      `No WooCommerce stores configured for hub owner user ${ownerId}. Set HUB_OWNER_USER_ID on Railway or add store API keys under Settings → Integrations for that user.`
    );
  }

  if (await isQuickBooksConnected(ownerId)) {
    try {
      result.quickbooks = await syncQuickBooksInvoices(ownerId);
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : 'QuickBooks sync failed');
    }
  }

  if (await clickupConfigured(ownerId)) {
    try {
      result.clickup = await syncClickUpTasks(ownerId);
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : 'ClickUp sync failed');
    }
  }

  return result;
}

async function handle(request: Request) {
  const authHeader = request.headers.get('authorization') || '';
  const cronSecret = process.env.CRON_SECRET;

  // Keep invoice overdue status current without write-on-read on list/dashboard GETs.
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    const { markSentInvoicesOverdue } = await import('@/lib/invoices');
    await markSentInvoicesOverdue(null);
  }

  let ownerId: number;
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    ownerId = await resolveHubOwnerUserId();
  } else {
    const session = await getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    ownerId = await getDataOwnerId(session);
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
