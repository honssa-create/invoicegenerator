import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { denyReadOnlyWrite } from '@/lib/api-guard';
import { getDataOwnerId } from '@/lib/org-server';
import { syncAllWooStores } from '@/lib/hub-sync';
import { getWooStoreConfigs } from '@/lib/woocommerce';

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const denied = denyReadOnlyWrite(session, 'order_hub', request.method);
  if (denied) return denied;

  const ownerId = getDataOwnerId(session.userId);
  const stores = getWooStoreConfigs(ownerId);
  if (!stores.length) {
    return NextResponse.json(
      { error: 'No WooCommerce stores configured. Add API keys in Settings → API Integrations.' },
      { status: 400 }
    );
  }

  const results = await syncAllWooStores(ownerId);
  return NextResponse.json({ results });
}
