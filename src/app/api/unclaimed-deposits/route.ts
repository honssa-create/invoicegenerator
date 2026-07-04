import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { getUnclaimedDeposits } from '@/lib/payments';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const deposits = getUnclaimedDeposits(session.userId);
  return NextResponse.json({ deposits });
}

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = db.prepare('SELECT role FROM users WHERE id = ?').get(session.userId) as {
    role: string;
  };

  if (user?.role !== 'accountant') {
    return NextResponse.json({ error: 'Only accountants can log unclaimed deposits' }, { status: 403 });
  }

  try {
    const { deposit_date, amount, bank, remarks } = await request.json();

    if (!deposit_date || !amount || !bank) {
      return NextResponse.json(
        { error: 'Date, amount, and bank are required' },
        { status: 400 }
      );
    }

    const result = db
      .prepare(
        `INSERT INTO unclaimed_deposits (user_id, deposit_date, amount, bank, remarks, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        session.userId,
        deposit_date,
        Number(amount),
        bank.trim(),
        remarks?.trim() || null,
        session.userId
      );

    const deposit = getUnclaimedDeposits(session.userId).find(
      (d) => d.id === result.lastInsertRowid
    );

    return NextResponse.json({ deposit }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to log deposit' }, { status: 500 });
  }
}
