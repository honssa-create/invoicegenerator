import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getDataOwnerId } from '@/lib/org-server';
import { HUB_PLATFORMS, HUB_PLATFORM_LABELS, type HubIntegrationStatus } from '@/lib/hub';
import { listHubOrders, getSyncState } from '@/lib/hub-server';
import { getWooStoreConfigs, getWooStoreSetupIssue } from '@/lib/woocommerce';
import { isQuickBooksConnected, quickbooksConfigured } from '@/lib/hub-sync';
import { getQuickBooksCredentials } from '@/lib/integration-settings-server';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ownerId = await getDataOwnerId(session);
  const orders = await listHubOrders(ownerId);

  const integrations: HubIntegrationStatus[] = await Promise.all(HUB_PLATFORMS.filter((p) => p !== 'manual').map(async (platform) => {
    if (platform === 'quickbooks') {
      const qb = await getQuickBooksCredentials(ownerId);
      return {
        platform,
        label: HUB_PLATFORM_LABELS[platform],
        configured: await quickbooksConfigured(ownerId),
        connected: await isQuickBooksConnected(ownerId),
        last_synced_at: await getSyncState(ownerId, 'quickbooks', 'invoices'),
        environment: qb.environment,
      };
    }
    const setupIssue = await getWooStoreSetupIssue(ownerId, platform);
    const wooConfigured = (await getWooStoreConfigs(ownerId)).some((s) => s.platform === platform);
    const hasPartialConfig = setupIssue !== 'not_configured';
    return {
      platform,
      label: HUB_PLATFORM_LABELS[platform],
      configured: hasPartialConfig,
      connected: wooConfigured,
      last_synced_at: await getSyncState(ownerId, 'woocommerce', platform),
      setup_error: setupIssue && setupIssue !== 'not_configured' ? setupIssue : null,
    };
  }));

  const byPlatform = Object.fromEntries(
    HUB_PLATFORMS.map((p) => [p, orders.filter((o) => o.source_platform === p).length])
  );

  return NextResponse.json({
    orders,
    integrations,
    summary: {
      total: orders.length,
      external: orders.filter((o) => o.source_platform !== 'manual').length,
      byPlatform,
    },
  });
}
