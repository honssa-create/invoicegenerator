import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { requireApiAdmin } from '@/lib/api-guard';
import { USER_ROLES, type UserRole } from '@/lib/permissions';
import { getUserById } from '@/lib/permissions-server';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await requireApiAdmin(request);
  if (session instanceof NextResponse) return session;

  const userId = Number(params.id);
  const existing = getUserById(userId);
  if (!existing) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const body = await request.json();
  const { role, name, company_name } = body;

  if (userId === session.userId && role && role !== 'admin') {
    return NextResponse.json({ error: 'You cannot remove your own admin role' }, { status: 400 });
  }

  const fields: string[] = [];
  const values: (string | number)[] = [];

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
  if (company_name !== undefined) {
    fields.push('company_name = ?');
    values.push(company_name?.trim() || null);
  }

  if (fields.length === 0) {
    return NextResponse.json({ error: 'No changes provided' }, { status: 400 });
  }

  values.push(userId);
  db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  return NextResponse.json({ user: getUserById(userId) });
}
