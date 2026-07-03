import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { getInvoiceWithDetails } from '@/lib/invoices';
import { logActivity } from '@/lib/activity';
import { sendEmail } from '@/lib/email';

interface DueInvoice {
  id: number;
  user_id: number;
  invoice_number: string;
  status: string;
  order_id: number | null;
  created_at: string;
  customer_email: string | null;
  order_email: string | null;
}

async function runReminders(userId: number | null) {
  const days = Number(process.env.REMINDER_DAYS || 30);

  // Not fully paid, at least `days` old, and not reminded within the last `days`.
  let query = `
    SELECT i.id, i.user_id, i.invoice_number, i.status, i.order_id, i.created_at,
           c.email AS customer_email, o.customer_email AS order_email
    FROM invoices i
    LEFT JOIN customers c ON c.id = i.customer_id
    LEFT JOIN orders o ON o.id = i.order_id
    WHERE i.status != 'paid'
      AND julianday('now') - julianday(i.created_at) >= ?
      AND (i.last_reminder_at IS NULL OR julianday('now') - julianday(i.last_reminder_at) >= ?)`;
  const params: (number | string)[] = [days, days];
  if (userId !== null) {
    query += ' AND i.user_id = ?';
    params.push(userId);
  }

  const rows = db.prepare(query).all(...params) as DueInvoice[];
  const results: { invoice: string; email: string | null; sent: boolean; provider: string }[] = [];
  const today = new Date().toISOString().slice(0, 10);
  const markReminded = db.prepare("UPDATE invoices SET last_reminder_at = datetime('now') WHERE id = ?");

  for (const inv of rows) {
    const email = inv.order_email || inv.customer_email || null;
    const details = getInvoiceWithDetails(inv.id, inv.user_id);
    const total = details ? details.total.toFixed(2) : '';

    let result = { sent: false, provider: 'log' as string };
    if (email) {
      const r = await sendEmail(
        email,
        `Payment reminder: Invoice ${inv.invoice_number}`,
        `<p>This is a friendly reminder that invoice <strong>${inv.invoice_number}</strong> (total ${total}) remains unpaid after 30 days. Please arrange payment at your earliest convenience.</p>`
      );
      result = { sent: r.sent, provider: r.provider };
    }

    markReminded.run(inv.id);

    const msg = `[System] Automated 30-day payment reminder email ${email ? `sent to ${email}` : '(no client email on file)'} on ${today}`;
    logActivity('invoice', inv.id, inv.user_id, 'activity', 'System', msg);
    if (inv.order_id) {
      logActivity('order', inv.order_id, inv.user_id, 'activity', 'System', msg);
    }

    results.push({ invoice: inv.invoice_number, email, ...result });
  }

  return { processed: rows.length, reminders: results, days };
}

async function handle(request: Request) {
  const authHeader = request.headers.get('authorization') || '';
  const cronSecret = process.env.CRON_SECRET;

  // Scheduler mode: Bearer CRON_SECRET processes every user's invoices.
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return NextResponse.json(await runReminders(null));
  }

  // Interactive mode: an authenticated user runs it for their own invoices.
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
