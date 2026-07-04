import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { hashPassword, createToken, setSessionCookie } from '@/lib/auth';
import { resolveTeamId } from '@/lib/team';

export async function POST(request: Request) {
  try {
    const { email, password, name, company_name, role = 'sales' } = await request.json();

    if (!email || !password || !name) {
      return NextResponse.json({ error: 'Email, password, and name are required' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    const validRole = role === 'accountant' ? 'accountant' : 'sales';

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);
    const result = db
      .prepare('INSERT INTO users (email, password_hash, name, company_name, role) VALUES (?, ?, ?, ?, ?)')
      .run(email.toLowerCase().trim(), passwordHash, name.trim(), company_name?.trim() || null, validRole);

    const userId = result.lastInsertRowid as number;
    const teamId = resolveTeamId(company_name, userId);
    db.prepare('UPDATE users SET team_id = ? WHERE id = ?').run(teamId, userId);

    const token = await createToken({ userId, email: email.toLowerCase().trim(), name: name.trim() });
    await setSessionCookie(token);

    return NextResponse.json({
      user: {
        id: userId,
        email: email.toLowerCase().trim(),
        name: name.trim(),
        company_name,
        role: validRole,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
}
