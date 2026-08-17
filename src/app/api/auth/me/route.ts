import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { ROLE_LABELS } from '@/lib/permissions';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Trust JWT role/permissions (refreshed on login / role change). One DB read for profile fields only.
  const user = await db
    .prepare('SELECT id, email, name, company_name, created_at FROM users WHERE id = ?')
    .get(session.userId) as {
    id: number;
    email: string;
    name: string;
    company_name: string | null;
    created_at: string;
  } | undefined;

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      company_name: user.company_name,
      role: session.role,
      role_label: ROLE_LABELS[session.role],
      permissions: session.permissions,
      created_at: user.created_at,
    },
  });
}
