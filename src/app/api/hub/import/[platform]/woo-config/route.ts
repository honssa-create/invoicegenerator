import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { denyReadOnlyWrite } from '@/lib/api-guard';
import { isSectionReadOnly } from '@/lib/permissions';
import { getDataOwnerId } from '@/lib/org-server';
import { getIntegrationSettings } from '@/lib/integration-settings-server';
import { getWooStoreSetupIssue } from '@/lib/woocommerce';
import { normalizeWooStoreUrl } from '@/lib/woo-url';

const WOO_PLATFORMS = ['nestiee', 'honour', 'cupmoka'] as const;
type WooPlatform = (typeof WOO_PLATFORMS)[number];

function isWooPlatform(value: string): value is WooPlatform {
  return (WOO_PLATFORMS as readonly string[]).includes(value);
}

export async function GET(
  _request: Request,
  { params }: { params: { platform: string } }
) {
  const session = await getSessionFromRequest(_request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (isSectionReadOnly(session.role, 'order_hub')) {
    return NextResponse.json({ error: 'Read-only access' }, { status: 403 });
  }

  const denied = denyReadOnlyWrite(session, 'order_hub', 'GET');
  if (denied) return denied;

  const platform = params.platform;
  if (!isWooPlatform(platform)) {
    return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
  }

  const ownerId = getDataOwnerId(session.userId);
  const issue = getWooStoreSetupIssue(ownerId, platform);
  if (issue === 'not_configured') {
    return NextResponse.json({ error: 'Store is not configured.' }, { status: 400 });
  }
  if (issue) {
    return NextResponse.json({ error: issue }, { status: 400 });
  }

  const store = getIntegrationSettings(ownerId).woocommerce[platform];
  const normalized = normalizeWooStoreUrl(store.url);
  if (!normalized.ok) {
    return NextResponse.json({ error: normalized.error }, { status: 400 });
  }

  return NextResponse.json({
    storeUrl: normalized.url,
    consumerKey: store.key,
    consumerSecret: store.secret,
  });
}
