import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { verifyPassword, createSessionForUserId, setSessionCookie } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const user = db
      .prepare('SELECT id, email, password_hash, name, company_name, role FROM users WHERE email = ?')
      .get(email.toLowerCase().trim()) as {
      id: number;
      email: string;
      password_hash: string;
      name: string;
      company_name: string | null;
      role: string;
    } | undefined;

    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const session = await createSessionForUserId(user.id);
    if (!session) return NextResponse.json({ error: 'Login failed' }, { status: 500 });
    await setSessionCookie(session.token);

    return NextResponse.json({ user: session.user });
  } catch {
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
