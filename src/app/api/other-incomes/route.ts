import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { getOtherIncomes } from '@/lib/ledger';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const incomes = getOtherIncomes(session.userId);
  return NextResponse.json({ incomes });
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
    return NextResponse.json({ error: 'Only accountants can log other income' }, { status: 403 });
  }

  try {
    const { category, amount, income_date, remarks } = await request.json();

    if (!category || !amount || !income_date) {
      return NextResponse.json(
        { error: 'Category, amount, and date are required' },
        { status: 400 }
      );
    }

    const result = db
      .prepare(
        `INSERT INTO other_incomes (user_id, category, amount, income_date, remarks, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        session.userId,
        category.trim(),
        Number(amount),
        income_date,
        remarks?.trim() || null,
        session.userId
      );

    const income = getOtherIncomes(session.userId).find(
      (i) => i.id === result.lastInsertRowid
    );

    return NextResponse.json({ income }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to log other income' }, { status: 500 });
  }
}
