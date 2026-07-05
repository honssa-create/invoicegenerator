import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest, createSessionForUserId, setSessionCookie } from '@/lib/auth';
import { getPermissionsListForRole, getUserRole } from '@/lib/permissions-server';
import { ROLE_LABELS } from '@/lib/permissions';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = db
    .prepare('SELECT id, email, name, company_name, role, created_at FROM users WHERE id = ?')
    .get(session.userId) as {
    id: number;
    email: string;
    name: string;
    company_name: string | null;
    role: string;
    created_at: string;
  } | undefined;

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const role = getUserRole(session.userId);
  const permissions = getPermissionsListForRole(role);

  const fresh = await createSessionForUserId(session.userId);
  if (fresh) await setSessionCookie(fresh.token);

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      company_name: user.company_name,
      role,
      role_label: ROLE_LABELS[role],
      permissions,
      created_at: user.created_at,
    },
  });
}
