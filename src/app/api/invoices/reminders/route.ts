import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getDataOwnerId } from '@/lib/org-server';
import { listReminderCandidates } from '@/lib/payment-reminders-server';

/** List unpaid invoices eligible for overdue or due-soon reminders, with draft subject/body. */
export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ownerId = await getDataOwnerId(session);
  const { overdueDays, dueSoonDays, candidates } = await listReminderCandidates(ownerId);
  return NextResponse.json({ overdueDays, dueSoonDays, days: overdueDays, candidates });
}
