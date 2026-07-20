import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { denyReadOnlyWrite } from '@/lib/api-guard';
import { getDataOwnerId } from '@/lib/org-server';
import { importHubPlatform, isQuickBooksConnected } from '@/lib/hub-sync';
import { getWooStoreSetupIssue } from '@/lib/woocommerce';
import { getQuickBooksCredentials } from '@/lib/integration-settings-server';
import { parseHubImportDateRange } from '@/lib/hub-import';

const PLATFORMS = ['nestiee', 'honour', 'cupmoka', 'quickbooks'] as const;
type ImportPlatform = (typeof PLATFORMS)[number];

function isImportPlatform(value: string): value is ImportPlatform {
  return (PLATFORMS as readonly string[]).includes(value);
}

export async function POST(
  request: Request,
  { params }: { params: { platform: string } }
) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const denied = denyReadOnlyWrite(session, 'order_hub', request.method);
  if (denied) return denied;

  const platform = params.platform;
  if (!isImportPlatform(platform)) {
    return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
  }

  let body: { date_from?: string; date_to?: string } = {};
  try {
    body = await request.json();
  } catch {
  }

  const parsedRange = parseHubImportDateRange(body);
  if (!parsedRange.ok) {
    return NextResponse.json({ error: parsedRange.error }, { status: 400 });
  }

  const ownerId = getDataOwnerId(session.userId);

  if (platform === 'quickbooks') {
    if (!isQuickBooksConnected(ownerId)) {
      return NextResponse.json({ error: 'QuickBooks is not connected. Connect OAuth first.' }, { status: 400 });
    }
  } else {
    const issue = getWooStoreSetupIssue(ownerId, platform);
    if (issue === 'not_configured') {
      return NextResponse.json(
        { error: `${platform} is not configured. Add WooCommerce API keys in Settings → API Integrations.` },
        { status: 400 }
      );
    }
    if (issue) {
      return NextResponse.json({ error: issue }, { status: 400 });
    }
  }

  try {
    const result = await importHubPlatform(ownerId, platform, parsedRange.range);
    const qbEnv = platform === 'quickbooks' ? getQuickBooksCredentials(ownerId).environment : null;
    if (result.errors.length && result.fetched === 0 && result.inserted === 0 && result.updated === 0) {
      return NextResponse.json({ error: result.errors[0], result, date_range: parsedRange.range }, { status: 400 });
    }
    return NextResponse.json({ result, environment: qbEnv, date_range: parsedRange.range });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Import failed' },
      { status: 500 }
    );
  }
}
