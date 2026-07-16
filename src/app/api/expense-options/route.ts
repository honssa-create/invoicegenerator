import { NextResponse } from 'next/server';
import { requireApiAccess } from '@/lib/api-guard';
import { OPTION_TYPES, type OptionType } from '@/lib/expenses';
import { addManagedOption, mergedOptions } from '@/lib/expense-options-server';
import { getDataOwnerId } from '@/lib/org-server';

export async function GET(request: Request) {
  const session = await requireApiAccess(request, 'expenses');
  if (session instanceof NextResponse) return session;

  const ownerId = getDataOwnerId(session.userId);

  const options = Object.fromEntries(
    OPTION_TYPES.map((type) => [type, mergedOptions(ownerId, type)])
  );
  return NextResponse.json({ options });
}

export async function POST(request: Request) {
  const session = await requireApiAccess(request, 'expenses');
  if (session instanceof NextResponse) return session;

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
    const result = addManagedOption(ownerId, type as OptionType, trimmed);

    return NextResponse.json({
      value: trimmed,
      option: result.option,
      options: result.options,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to add option' }, { status: 500 });
  }
}
