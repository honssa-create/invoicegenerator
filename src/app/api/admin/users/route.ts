import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { requireApiAdmin } from '@/lib/api-guard';
import { USER_ROLES, ROLE_LABELS, type UserRole } from '@/lib/permissions';
import { listUsers } from '@/lib/permissions-server';
import { getDataOwnerId } from '@/lib/org-server';

export async function GET(request: Request) {
  const session = await requireApiAdmin(request);
  if (session instanceof NextResponse) return session;
  return NextResponse.json({ users: listUsers(), roles: USER_ROLES, role_labels: ROLE_LABELS });
}

export async function POST(request: Request) {
  const session = await requireApiAdmin(request);
  if (session instanceof NextResponse) return session;

  try {
    const { email, password, name, company_name, role } = await request.json();

    if (!email?.trim() || !password || !name?.trim()) {
      return NextResponse.json({ error: 'Email, password, and name are required' }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }
    const userRole: UserRole = USER_ROLES.includes(role) ? role : 'operator';

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
    if (existing) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);
    const ownerId = getDataOwnerId(session.userId);
    const result = db
      .prepare(
        'INSERT INTO users (email, password_hash, name, company_name, role, owner_user_id) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(
        email.toLowerCase().trim(),
        passwordHash,
        name.trim(),
        company_name?.trim() || null,
        userRole,
        ownerId
      );

    const userId = result.lastInsertRowid as number;
    const user = listUsers().find((u) => u.id === userId);
    return NextResponse.json({ user }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
  }
}
