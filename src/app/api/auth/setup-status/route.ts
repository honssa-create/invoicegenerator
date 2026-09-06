import { NextResponse } from 'next/server';
import db from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  // pg returns COUNT(*) as a string (int8); coerce before comparing.
  const count = Number(
    (await db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number | string })?.c ?? 0
  );
  return NextResponse.json({ registration_open: count === 0, user_count: count });
}
