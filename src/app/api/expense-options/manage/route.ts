import { NextResponse } from 'next/server';
import { requireApiAccess } from '@/lib/api-guard';
import { listManagedOptions } from '@/lib/expense-options-server';
import { OPTION_LABELS, OPTION_TYPES } from '@/lib/expenses';
import { getDataOwnerId } from '@/lib/org-server';

export async function GET(request: Request) {
  const session = await requireApiAccess(request, 'settings');
  if (session instanceof NextResponse) return session;

  const ownerId = getDataOwnerId(session.userId);
  const options = listManagedOptions(ownerId);

  return NextResponse.json({
    options,
    types: OPTION_TYPES,
    labels: OPTION_LABELS,
  });
}
