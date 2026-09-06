import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { runKitchenPrepAutoImport } from '@/lib/kitchen-prep-server';

async function handle(request: Request) {
  const authHeader = request.headers.get('authorization') || '';
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return NextResponse.json(await runKitchenPrepAutoImport(null));
  }

  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(await runKitchenPrepAutoImport(session.userId));
}

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}
