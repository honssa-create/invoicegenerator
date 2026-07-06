import { NextResponse } from 'next/server';
import type { SessionPayload } from './auth';
import { getSessionFromRequest } from './auth';
import {
  canAccessSection,
  isSectionReadOnly,
  sectionForApiPath,
  type PermissionSection,
} from './permissions';
import { requireAdmin } from './permissions-server';

export async function requireApiSession(
  request: Request
): Promise<SessionPayload | NextResponse> {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return session;
}

export async function requireApiAdmin(request: Request): Promise<SessionPayload | NextResponse> {
  const session = await requireApiSession(request);
  if (session instanceof NextResponse) return session;
  if (!requireAdmin(session.userId)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }
  return session;
}

/** Enforce section permission based on API path (or explicit section). */
export async function requireApiAccess(
  request: Request,
  sectionOverride?: PermissionSection | null
): Promise<SessionPayload | NextResponse> {
  const session = await requireApiSession(request);
  if (session instanceof NextResponse) return session;

  const url = new URL(request.url);
  const section = sectionOverride === undefined ? sectionForApiPath(url.pathname) : sectionOverride;
  if (section && !canAccessSection(session.role, session.permissions, section)) {
    return NextResponse.json({ error: 'Forbidden — insufficient permissions' }, { status: 403 });
  }
  return session;
}

/** Block mutating requests when the role has read-only access to a section. */
export function denyReadOnlyWrite(
  session: SessionPayload,
  section: PermissionSection,
  method: string
): NextResponse | null {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return null;
  if (isSectionReadOnly(session.role, section)) {
    return NextResponse.json({ error: 'Read-only access' }, { status: 403 });
  }
  return null;
}
