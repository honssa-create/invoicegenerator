import { NextResponse } from 'next/server';
import { requirePartTime } from '@/lib/part-time-guard';
import { createStaff, listStaff } from '@/lib/part-time-server';

export async function GET(request: Request) {
  const access = await requirePartTime(request);
  if (access instanceof NextResponse) return access;
  const includeInactive = new URL(request.url).searchParams.get('all') === '1';
  const staff = await listStaff(access.ownerId, includeInactive);
  return NextResponse.json({ staff });
}

export async function POST(request: Request) {
  const access = await requirePartTime(request);
  if (access instanceof NextResponse) return access;
  const body = await request.json().catch(() => null);
  const result = await createStaff(access.ownerId, {
    name: body?.name,
    hourlyRate: body?.hourlyRate,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ staff: result.data }, { status: 201 });
}
