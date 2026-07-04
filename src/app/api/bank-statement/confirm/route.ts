import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { confirmSuggestedMatches } from '@/lib/reconciliation';

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = db.prepare('SELECT role FROM users WHERE id = ?').get(session.userId) as {
    role: string;
  };

  if (user?.role !== 'accountant') {
    return NextResponse.json(
      { error: 'Only accountants can confirm matches' },
      { status: 403 }
    );
  }

  try {
    const { payment_ids } = await request.json();

    if (!Array.isArray(payment_ids) || payment_ids.length === 0) {
      return NextResponse.json({ error: 'No payments selected' }, { status: 400 });
    }

    const confirmed = confirmSuggestedMatches(
      payment_ids.map(Number),
      session.userId,
      session.userId
    );

    return NextResponse.json({ confirmed });
  } catch {
    return NextResponse.json({ error: 'Failed to confirm matches' }, { status: 500 });
  }
}
