import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { requireApiAdmin } from '@/lib/api-guard';
import { USER_ROLES, type UserRole } from '@/lib/permissions';
import { countAdmins, countChildUsers, getUserById } from '@/lib/permissions-server';

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const session = await requireApiAdmin(_request);
  if (session instanceof NextResponse) return session;

  const userId = Number(params.id);
  if (!Number.isFinite(userId)) {
    return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
  }

  const existing = await getUserById(userId);
  if (!existing) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  if (existing.role === 'admin' && (await countAdmins()) <= 1) {
    return NextResponse.json({ error: 'Cannot delete the last admin' }, { status: 400 });
  }

  if ((await countChildUsers(userId)) > 0) {
    return NextResponse.json(
      { error: 'Cannot delete while other users belong to this account' },
      { status: 400 }
    );
  }

  await db.transaction(async () => {
    await db.prepare('UPDATE expenses SET created_by_user_id = NULL WHERE created_by_user_id = ?').run(userId);
    await db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  });

  return NextResponse.json({ success: true, id: userId });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await requireApiAdmin(request);
  if (session instanceof NextResponse) return session;

  const userId = Number(params.id);
  const existing = await getUserById(userId);
  if (!existing) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const body = await request.json();
  const { role, name, company_name, email } = body;

  if (userId === session.userId && role && role !== 'admin') {
    return NextResponse.json({ error: 'You cannot remove your own admin role' }, { status: 400 });
  }

  const fields: string[] = [];
  const values: (string | number | null)[] = [];

  if (role !== undefined) {
    if (!USER_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }
    fields.push('role = ?');
    values.push(role);
  }
  if (name !== undefined) {
    if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    fields.push('name = ?');
    values.push(name.trim());
  }
  if (email !== undefined) {
    const normalized = String(email).toLowerCase().trim();
    if (!normalized || !normalized.includes('@')) {
      return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
    }
    const taken = await db
      .prepare('SELECT id FROM users WHERE email = ? AND id != ?')
      .get(normalized, userId);
    if (taken) {
      return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
    }
    fields.push('email = ?');
    values.push(normalized);
  }
  if (company_name !== undefined) {
    fields.push('company_name = ?');
    values.push(company_name?.trim() || null);
  }

  if (fields.length === 0) {
    return NextResponse.json({ error: 'No changes provided' }, { status: 400 });
  }

  values.push(userId);
  await db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  return NextResponse.json({ user: await getUserById(userId) });
}
