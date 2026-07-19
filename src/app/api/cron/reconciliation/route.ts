import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { syncYedpayForUser } from '@/lib/reconciliation-server';

async function runSync(userId: number | null) {
  let query = 'SELECT id FROM users';
  const params: number[] = [];
  if (userId !== null) {
    query += ' WHERE id = ?';
    params.push(userId);
  }
  const users = db.prepare(query).all(...params) as { id: number }[];

  const results: { user_id: number; fetched: number; imported: number; matched: number; skipped: number; error?: string }[] = [];

  for (const user of users) {
    try {
      const r = await syncYedpayForUser(user.id);
      results.push({ user_id: user.id, ...r });
    } catch (err) {
      results.push({
        user_id: user.id,
        fetched: 0,
        imported: 0,
        matched: 0,
        skipped: 0,
        error: err instanceof Error ? err.message : 'sync failed',
      });
    }
  }

  return { processed: users.length, results };
}

async function handle(request: Request) {
  const authHeader = request.headers.get('authorization') || '';
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return NextResponse.json(await runSync(null));
  }

  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(await runSync(session.userId));
}

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}
