import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { confirmSuggestedMatches } from '@/lib/bank-statement-server';
import type { ConfirmMatchPayload } from '@/lib/bank-statement';

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const matches = (body.matches || []) as ConfirmMatchPayload[];
    if (!Array.isArray(matches) || matches.length === 0) {
      return NextResponse.json({ error: 'No matches to confirm' }, { status: 400 });
    }
    const confirmed = confirmSuggestedMatches(session.userId, matches);
    return NextResponse.json({ confirmed });
  } catch {
    return NextResponse.json({ error: 'Confirmation failed' }, { status: 500 });
  }
}
