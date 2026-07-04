import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = db
    .prepare('SELECT id, email, name, company_name, role, created_at FROM users WHERE id = ?')
    .get(session.userId);

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const userWithRole = { ...user, role: (user as { role?: string }).role || 'sales' };

  return NextResponse.json({ user: userWithRole });
}
