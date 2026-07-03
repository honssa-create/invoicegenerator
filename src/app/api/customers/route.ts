import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const customers = db
    .prepare('SELECT * FROM customers WHERE user_id = ? ORDER BY name')
    .all(session.userId);

  return NextResponse.json({ customers });
}

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { name, email, phone, address, city, state, zip } = await request.json();

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Customer name is required' }, { status: 400 });
    }

    const result = db
      .prepare(
        `INSERT INTO customers (user_id, name, email, phone, address, city, state, zip)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        session.userId,
        name.trim(),
        email?.trim() || null,
        phone?.trim() || null,
        address?.trim() || null,
        city?.trim() || null,
        state?.trim() || null,
        zip?.trim() || null
      );

    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(result.lastInsertRowid);
    return NextResponse.json({ customer }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to create customer' }, { status: 500 });
  }
}
