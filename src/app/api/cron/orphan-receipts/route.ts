import { NextResponse } from 'next/server';
import {
  DEFAULT_ORPHAN_MIN_AGE_HOURS,
  sweepOrphanReceipts,
} from '@/lib/orphan-receipt-sweep';

function parseBoolean(value: string | null, fallback: boolean): boolean {
  if (value == null || value.trim() === '') return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes') return true;
  if (normalized === '0' || normalized === 'false' || normalized === 'no') return false;
  return fallback;
}

function parseMinAgeHours(value: string | null): number {
  if (!value?.trim()) return DEFAULT_ORPHAN_MIN_AGE_HOURS;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_ORPHAN_MIN_AGE_HOURS;
  return Math.floor(parsed);
}

async function handle(request: Request) {
  const authHeader = request.headers.get('authorization') || '';
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const dryRun = parseBoolean(url.searchParams.get('dry_run'), false);
  const minAgeHours = parseMinAgeHours(url.searchParams.get('min_age_hours'));

  try {
    const result = await sweepOrphanReceipts({ dryRun, minAgeHours });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Orphan receipt sweep failed';
    console.error('[cron/orphan-receipts]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}
