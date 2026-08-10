import { NextResponse } from 'next/server';
import { denyReadOnlyWrite, requireApiAccess } from '@/lib/api-guard';
import { rentalOwnerId } from '@/lib/org-server';
import {
  deleteUtilityMeterRound,
  getUtilityMeterRound,
  updateUtilityMeterRound,
} from '@/lib/utility-meter-server';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await requireApiAccess(request, 'rentals');
  if (session instanceof NextResponse) return session;
  const round = await getUtilityMeterRound(params.id, await rentalOwnerId(session.userId));
  if (!round) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ round });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await requireApiAccess(request, 'rentals');
  if (session instanceof NextResponse) return session;
  const denied = denyReadOnlyWrite(session, 'rentals', request.method);
  if (denied) return denied;
  try {
    const body = await request.json();
    const round = await updateUtilityMeterRound(
      params.id,
      await rentalOwnerId(session.userId),
      body,
    );
    if (!round) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ round });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to update meter round';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const session = await requireApiAccess(request, 'rentals');
  if (session instanceof NextResponse) return session;
  const denied = denyReadOnlyWrite(session, 'rentals', request.method);
  if (denied) return denied;
  const ok = await deleteUtilityMeterRound(params.id, await rentalOwnerId(session.userId));
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
