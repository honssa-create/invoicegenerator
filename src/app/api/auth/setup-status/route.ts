import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET() {
  const count = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
  return NextResponse.json({ registration_open: count === 0, user_count: count });
}
