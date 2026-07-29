import { NextResponse } from 'next/server';
import db from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const count = (await db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
  return NextResponse.json({ registration_open: count === 0, user_count: count });
}
