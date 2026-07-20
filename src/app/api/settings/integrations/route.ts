import { NextResponse } from 'next/server';
import { requireApiAccess, denyReadOnlyWrite } from '@/lib/api-guard';
import { getDataOwnerId } from '@/lib/org-server';
import {
  getIntegrationSettingsMasked,
  saveIntegrationSettings,
} from '@/lib/integration-settings-server';
import type { IntegrationSettingsUpdate } from '@/lib/integration-settings-server';

export async function GET(request: Request) {
  const session = await requireApiAccess(request, 'settings');
  if (session instanceof NextResponse) return session;

  const ownerId = getDataOwnerId(session.userId);
  return NextResponse.json({ settings: getIntegrationSettingsMasked(ownerId) });
}

export async function PUT(request: Request) {
  const session = await requireApiAccess(request, 'settings');
  if (session instanceof NextResponse) return session;

  const denied = denyReadOnlyWrite(session, 'settings', request.method);
  if (denied) return denied;

  let body: IntegrationSettingsUpdate;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const ownerId = getDataOwnerId(session.userId);
  try {
    saveIntegrationSettings(ownerId, body);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save settings' },
      { status: 400 }
    );
  }
  return NextResponse.json({ settings: getIntegrationSettingsMasked(ownerId) });
}
