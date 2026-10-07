import { NextResponse } from 'next/server';
import type { SessionPayload } from './auth';
import { denyReadOnlyWrite, requireApiAccess } from './api-guard';
import { resolveDataOwnerId } from './org-server';

export async function requirePartTime(
  request: Request,
): Promise<{ ownerId: number; session: SessionPayload } | NextResponse> {
  const session = await requireApiAccess(request);
  if (session instanceof NextResponse) return session;
  const denied = denyReadOnlyWrite(session, 'part_time', request.method);
  if (denied) return denied;
  const ownerId = await resolveDataOwnerId(session);
  return { ownerId, session };
}
