import { NextResponse } from 'next/server';
import { denyReadOnlyWrite, requireApiAccess } from '@/lib/api-guard';
import { rentalOwnerId } from '@/lib/org-server';
import {
  createUtilityMeterRound,
  listUtilityMeterRounds,
} from '@/lib/utility-meter-server';

export async function GET(request: Request) {
  const session = await requireApiAccess(request, 'rental_meters');
  if (session instanceof NextResponse) return session;
  const ownerId = await rentalOwnerId(session);
  const rounds = await listUtilityMeterRounds(ownerId);
  return NextResponse.json({ rounds });
}

export async function POST(request: Request) {
  const session = await requireApiAccess(request, 'rental_meters');
  if (session instanceof NextResponse) return session;
  const denied = denyReadOnlyWrite(session, 'rental_meters', request.method);
  if (denied) return denied;
  try {
    const body = await request.json();
    const round = await createUtilityMeterRound(await rentalOwnerId(session), body);
    return NextResponse.json({ round }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to create meter round';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
