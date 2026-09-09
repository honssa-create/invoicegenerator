import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { denyReadOnlyWrite } from '@/lib/api-guard';
import { getDataOwnerId } from '@/lib/org-server';
import { syncWooStore } from '@/lib/hub-sync';
import { getWooStoreConfigs, getWooStoreSetupIssue } from '@/lib/woocommerce';

const WOO_PLATFORMS = ['nestiee', 'honour', 'honour_en', 'cupmoka'] as const;
type WooPlatform = (typeof WOO_PLATFORMS)[number];

function isWooPlatform(value: string): value is WooPlatform {
  return (WOO_PLATFORMS as readonly string[]).includes(value);
}

/** Incremental Woo pull (modified + recent created) — no date range required. */
export async function POST(
  request: Request,
  { params }: { params: { platform: string } },
) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const denied = denyReadOnlyWrite(session, 'order_hub', request.method);
  if (denied) return denied;

  const platform = params.platform;
  if (!isWooPlatform(platform)) {
    return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
  }

  const ownerId = await getDataOwnerId(session);
  const issue = await getWooStoreSetupIssue(ownerId, platform);
  if (issue === 'not_configured') {
    return NextResponse.json({ error: 'Store is not configured.' }, { status: 400 });
  }
  if (issue) {
    return NextResponse.json({ error: issue }, { status: 400 });
  }

  const store = (await getWooStoreConfigs(ownerId)).find((s) => s.platform === platform);
  if (!store) {
    return NextResponse.json({ error: 'Store is not configured.' }, { status: 400 });
  }

  try {
    const result = await syncWooStore(ownerId, store);
    if (result.errors.length && result.fetched === 0 && result.inserted === 0 && result.updated === 0) {
      return NextResponse.json({ error: result.errors[0], result }, { status: 400 });
    }
    return NextResponse.json({ result, mode: 'incremental' });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Sync failed' },
      { status: 500 },
    );
  }
}
