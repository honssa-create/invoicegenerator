import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Enter a valid amount' }, { status: 400 });
    }
    const res = db
      .prepare(
        `INSERT INTO other_income (user_id, category, txn_date, amount, account, remarks, receipt_path)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        session.userId,
        body.category?.trim() || '其他',
        body.txn_date?.trim() || null,
        amount,
        body.account?.trim() || null,
        body.remarks?.trim() || null,
        body.receipt_path?.trim() || null
      );
    const income = db.prepare('SELECT * FROM other_income WHERE id = ?').get(res.lastInsertRowid);
    return NextResponse.json({ income }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to add income' }, { status: 500 });
  }
}
