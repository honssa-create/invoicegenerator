import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { requireApiAdmin } from '@/lib/api-guard';
import { getUserById } from '@/lib/permissions-server';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await requireApiAdmin(request);
  if (session instanceof NextResponse) return session;

  const userId = Number(params.id);
  if (!getUserById(userId)) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const { password } = await request.json();
  if (!password || password.length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, userId);

  return NextResponse.json({ success: true });
}
