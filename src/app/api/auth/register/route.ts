import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { hashPassword, createToken, setSessionCookie } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const { email, password, name, company_name } = await request.json();

    if (!email || !password || !name) {
      return NextResponse.json({ error: 'Email, password, and name are required' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);
    const result = db
      .prepare('INSERT INTO users (email, password_hash, name, company_name) VALUES (?, ?, ?, ?)')
      .run(email.toLowerCase().trim(), passwordHash, name.trim(), company_name?.trim() || null);

    const userId = result.lastInsertRowid as number;
    const token = await createToken({ userId, email: email.toLowerCase().trim(), name: name.trim() });
    await setSessionCookie(token);

    return NextResponse.json({
      user: { id: userId, email: email.toLowerCase().trim(), name: name.trim(), company_name },
    });
  } catch {
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
}
