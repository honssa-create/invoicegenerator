import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { verifyPassword, createToken, setSessionCookie } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const user = db
      .prepare('SELECT id, email, password_hash, name, company_name FROM users WHERE email = ?')
      .get(email.toLowerCase().trim()) as {
      id: number;
      email: string;
      password_hash: string;
      name: string;
      company_name: string | null;
    } | undefined;

    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const token = await createToken({ userId: user.id, email: user.email, name: user.name });
    await setSessionCookie(token);

    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, company_name: user.company_name },
    });
  } catch {
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
