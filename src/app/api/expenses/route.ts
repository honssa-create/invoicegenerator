import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';

const CATEGORIES = ['ingredients', 'packaging', 'marketing', 'rent', 'other'];
const STATUSES = ['unpaid', 'pending', 'paid'];

function normalizeNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function generateReceiptNumber(userId: number): string {
  const year = new Date().getFullYear();
  const row = db
    .prepare(`SELECT COUNT(*) as count FROM expenses WHERE user_id = ? AND receipt_no LIKE ?`)
    .get(userId, `EXP-${year}-%`) as { count: number };
  return `EXP-${year}-${String(row.count + 1).padStart(4, '0')}`;
}

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');
  const status = searchParams.get('status');

  let query = 'SELECT * FROM expenses WHERE user_id = ?';
  const params: (string | number)[] = [session.userId];

  if (category && CATEGORIES.includes(category)) {
    query += ' AND category = ?';
    params.push(category);
  }
  if (status && STATUSES.includes(status)) {
    query += ' AND payment_status = ?';
    params.push(status);
  }

  query += ' ORDER BY COALESCE(paid_date, created_at) DESC, id DESC';

  const expenses = db.prepare(query).all(...params);
  return NextResponse.json({ expenses });
}

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const category = CATEGORIES.includes(body.category) ? body.category : 'other';
    const payment_status = STATUSES.includes(body.payment_status) ? body.payment_status : 'unpaid';
    const amount_hkd = normalizeNumber(body.amount_hkd);
    const amount_rmb = normalizeNumber(body.amount_rmb);

    if (amount_hkd === null && amount_rmb === null) {
      return NextResponse.json(
        { error: 'Enter an amount in HKD or RMB' },
        { status: 400 }
      );
    }

    const receiptNo = generateReceiptNumber(session.userId);

    const result = db
      .prepare(
        `INSERT INTO expenses
          (user_id, receipt_no, category, merchant, amount_hkd, amount_rmb, paid_date, order_no, platform, notes, payment_status, receipt_path)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        session.userId,
        receiptNo,
        category,
        body.merchant?.trim() || null,
        amount_hkd,
        amount_rmb,
        body.paid_date?.trim() || null,
        body.order_no?.trim() || null,
        body.platform?.trim() || null,
        body.notes?.trim() || null,
        payment_status,
        body.receipt_path?.trim() || null
      );

    const expense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(result.lastInsertRowid);
    return NextResponse.json({ expense }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to create expense' }, { status: 500 });
  }
}
