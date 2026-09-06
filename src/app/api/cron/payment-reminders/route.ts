import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { logActivity } from '@/lib/activity';
import { sendEmail } from '@/lib/email';
import { plainTextToHtml } from '@/lib/payment-reminders';
import { listReminderCandidates } from '@/lib/payment-reminders-server';

/** Cron auto-sends overdue reminders only (due-soon is preview/send from UI). */
async function runReminders(userId: number | null) {
  // Keep overdue status current without doing it on every invoices/dashboard GET.
  const { markSentInvoicesOverdue } = await import('@/lib/invoices');
  await markSentInvoicesOverdue(userId);

  const { overdueDays, candidates } = await listReminderCandidates(userId, ['overdue']);
  const results: { invoice: string; email: string | null; sent: boolean; provider: string }[] = [];
  const markReminded = db.prepare("UPDATE invoices SET last_reminder_at = datetime('now') WHERE id = ?");

  for (const inv of candidates) {
    let result = { sent: false, provider: 'log' as string };
    if (inv.to) {
      const r = await sendEmail(inv.to, inv.subject, plainTextToHtml(inv.body), {
        userId: inv.user_id,
        orderType: inv.order_type,
      });
      result = { sent: r.sent, provider: r.provider };
    }

    // Mark handled only on successful send, or when there is no recipient (nothing to retry).
    // Send failures / Resend skips stay on the list for another attempt.
    if (result.sent || !inv.to) {
      await markReminded.run(inv.id);
    }

    const today = new Date().toISOString().slice(0, 10);
    let msg: string;
    if (!inv.to) {
      msg = `[System] Automated overdue payment reminder email (no client email on file) on ${today}`;
    } else if (result.sent) {
      msg = `[System] Automated overdue payment reminder email sent to ${inv.to} on ${today}`;
    } else if (result.provider === 'skipped') {
      msg = `[System] Automated overdue payment reminder to ${inv.to} skipped on ${today} (Resend not configured for this order type)`;
    } else {
      msg = `[System] Automated overdue payment reminder to ${inv.to} failed on ${today}`;
    }
    await logActivity('invoice', inv.id, inv.user_id, 'activity', 'System', msg);
    if (inv.order_id) {
      await logActivity('order', inv.order_id, inv.user_id, 'activity', 'System', msg);
    }

    results.push({ invoice: inv.invoice_number, email: inv.to, ...result });
  }

  return { processed: candidates.length, reminders: results, days: overdueDays };
}

async function handle(request: Request) {
  const authHeader = request.headers.get('authorization') || '';
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return NextResponse.json(await runReminders(null));
  }

  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(await runReminders(session.userId));
}

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}
