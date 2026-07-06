import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/api-guard';
import { PERMISSION_SECTIONS, USER_ROLES, ROLE_LABELS, type PermissionSection, type UserRole } from '@/lib/permissions';
import { getPermissionMatrix, saveRolePermissions } from '@/lib/permissions-server';
import { refreshSessionCookie } from '@/lib/auth';

export async function GET(request: Request) {
  const session = await requireApiAdmin(request);
  if (session instanceof NextResponse) return session;

  return NextResponse.json({
    matrix: getPermissionMatrix(),
    sections: PERMISSION_SECTIONS,
    roles: USER_ROLES.filter((r) => r !== 'admin'),
    role_labels: ROLE_LABELS,
  });
}

export async function PUT(request: Request) {
  const session = await requireApiAdmin(request);
  if (session instanceof NextResponse) return session;

  try {
    const body = await request.json();
    const { role, permissions } = body as {
      role: UserRole;
      permissions: Partial<Record<PermissionSection, boolean>>;
    };

    if (!role || role === 'admin') {
      return NextResponse.json({ error: 'Cannot modify admin role permissions' }, { status: 400 });
    }
    if (!USER_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    saveRolePermissions(role, permissions);
    await refreshSessionCookie(session.userId);

    return NextResponse.json({ matrix: getPermissionMatrix() });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to save permissions';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
