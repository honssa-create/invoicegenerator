import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { DEFAULT_OPTIONS, OPTION_TYPES, type OptionType } from '@/lib/expenses';
import { getDataOwnerId } from '@/lib/org-server';

function mergedOptions(userId: number, type: OptionType): string[] {
  const custom = db
    .prepare('SELECT value FROM expense_options WHERE user_id = ? AND type = ? ORDER BY id')
    .all(userId, type) as { value: string }[];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const v of [...DEFAULT_OPTIONS[type], ...custom.map((c) => c.value)]) {
    const key = v.trim();
    if (key && !seen.has(key)) {
      seen.add(key);
      result.push(key);
    }
  }
  return result;
}

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ownerId = getDataOwnerId(session.userId);

  const options = Object.fromEntries(
    OPTION_TYPES.map((type) => [type, mergedOptions(ownerId, type)])
  );
  return NextResponse.json({ options });
}

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { type, value } = await request.json();
    if (!OPTION_TYPES.includes(type)) {
      return NextResponse.json({ error: 'Invalid option type' }, { status: 400 });
    }
    const trimmed = typeof value === 'string' ? value.trim() : '';
    if (!trimmed) {
      return NextResponse.json({ error: 'Option value is required' }, { status: 400 });
    }

    const ownerId = getDataOwnerId(session.userId);

    // Only persist if it is not already a default or an existing custom option.
    const existing = mergedOptions(ownerId, type as OptionType);
    if (!existing.includes(trimmed)) {
      db.prepare(
        'INSERT OR IGNORE INTO expense_options (user_id, type, value) VALUES (?, ?, ?)'
      ).run(ownerId, type, trimmed);
    }

    return NextResponse.json({ value: trimmed, options: mergedOptions(ownerId, type as OptionType) });
  } catch {
    return NextResponse.json({ error: 'Failed to add option' }, { status: 500 });
  }
}
