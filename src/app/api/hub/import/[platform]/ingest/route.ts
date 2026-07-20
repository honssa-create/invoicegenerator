import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { denyReadOnlyWrite } from '@/lib/api-guard';
import { getDataOwnerId } from '@/lib/org-server';
import { ingestWooOrders } from '@/lib/hub-sync';
import { getWooStoreSetupIssue } from '@/lib/woocommerce';
import type { WooOrder } from '@/lib/woocommerce';
import { parseHubImportDateRange } from '@/lib/hub-import';

const WOO_PLATFORMS = ['nestiee', 'honour', 'cupmoka'] as const;
type WooPlatform = (typeof WOO_PLATFORMS)[number];

function isWooPlatform(value: string): value is WooPlatform {
  return (WOO_PLATFORMS as readonly string[]).includes(value);
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
  if (!isWooPlatform(platform)) {
    return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
  }

  let body: { date_from?: string; date_to?: string; orders?: WooOrder[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsedRange = parseHubImportDateRange(body);
  if (!parsedRange.ok) {
    return NextResponse.json({ error: parsedRange.error }, { status: 400 });
  }

  if (!Array.isArray(body.orders)) {
    return NextResponse.json({ error: 'orders array is required' }, { status: 400 });
  }

  const ownerId = getDataOwnerId(session.userId);
  const issue = getWooStoreSetupIssue(ownerId, platform);
  if (issue === 'not_configured') {
    return NextResponse.json({ error: 'Store is not configured.' }, { status: 400 });
  }
  if (issue) {
    return NextResponse.json({ error: issue }, { status: 400 });
  }

  const result = ingestWooOrders(ownerId, platform, body.orders, parsedRange.range);
  if (result.errors.length && result.fetched === 0 && result.inserted === 0 && result.updated === 0) {
    return NextResponse.json({ error: result.errors[0], result, date_range: parsedRange.range }, { status: 400 });
  }

  return NextResponse.json({ result, date_range: parsedRange.range, source: 'browser' });
}
