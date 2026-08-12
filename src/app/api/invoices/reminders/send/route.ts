import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { denyReadOnlyWrite } from '@/lib/api-guard';
import { getDataOwnerId } from '@/lib/org-server';
import { logActivity } from '@/lib/activity';
import { sendEmail } from '@/lib/email';
import {
  DUE_SOON_DAYS,
  defaultReminderBody,
  defaultReminderSubject,
  plainTextToHtml,
  type ReminderType,
} from '@/lib/payment-reminders';
import { getInvoiceWithDetails } from '@/lib/invoices';

function parseReminderType(raw: unknown): ReminderType {
  return raw === 'due_soon' ? 'due_soon' : 'overdue';
}

/** Send one edited payment-reminder email for an invoice. */
export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const denied = denyReadOnlyWrite(session, 'invoices', request.method);
  if (denied) return denied;

  const ownerId = await getDataOwnerId(session.userId);

  let body: { invoiceId?: number; to?: string; subject?: string; body?: string; type?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const invoiceId = Number(body.invoiceId);
  if (!Number.isFinite(invoiceId) || invoiceId <= 0) {
    return NextResponse.json({ error: 'invoiceId is required' }, { status: 400 });
  }

  const type = parseReminderType(body.type);
  const inv = await getInvoiceWithDetails(invoiceId, ownerId);
  if (!inv) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  if (inv.status === 'paid') {
    return NextResponse.json({ error: 'Invoice is already paid' }, { status: 400 });
  }

  const order = inv.order_id
    ? (await db
        .prepare('SELECT customer_email, fields_json FROM orders WHERE id = ? AND user_id = ?')
        .get(inv.order_id, ownerId) as { customer_email: string | null; fields_json: string | null } | undefined)
    : null;

  let orderType: string | null = null;
  if (order?.fields_json) {
    try {
      const fields = JSON.parse(order.fields_json) as Record<string, unknown>;
      orderType = typeof fields.order_type === 'string' && fields.order_type.trim() ? fields.order_type.trim() : null;
    } catch {
      orderType = null;
    }
  }

  const to = (body.to || '').trim() || order?.customer_email || inv.email || inv.customer_email || '';
  if (!to) {
    return NextResponse.json({ error: 'No recipient email — add an address before sending' }, { status: 400 });
  }

  const daysOffset = await (
    type === 'due_soon'
      ? (async () => {
          const row = await db
            .prepare(`SELECT CAST(julianday(?) - julianday('now') AS INTEGER) AS d`)
            .get(inv.due_date) as { d: number };
          return Math.max(0, Number(row?.d) || DUE_SOON_DAYS);
        })()
      : (async () => {
          const row = await db
            .prepare(`SELECT CAST(julianday('now') - julianday(?) AS INTEGER) AS d`)
            .get(inv.due_date) as { d: number };
          return Math.max(0, Number(row?.d) || 0);
        })()
  );

  const subject = (body.subject || '').trim() || defaultReminderSubject(type, inv.invoice_number);
  const textBody =
    (body.body || '').trim() ||
    defaultReminderBody(type, inv.invoice_number, inv.total, daysOffset, inv.due_date);

  const result = await sendEmail(to, subject, plainTextToHtml(textBody), {
    userId: ownerId,
    orderType,
  });

  if (type === 'due_soon') {
    await db.prepare(
      "UPDATE invoices SET last_due_soon_reminder_at = datetime('now') WHERE id = ? AND user_id = ?",
    ).run(invoiceId, ownerId);
  } else {
    await db.prepare("UPDATE invoices SET last_reminder_at = datetime('now') WHERE id = ? AND user_id = ?").run(
      invoiceId,
      ownerId,
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const kindLabel = type === 'due_soon' ? 'due-soon' : 'overdue';
  const msg = result.sent
    ? `[System] ${kindLabel} payment reminder email sent to ${to} on ${today}`
    : result.provider === 'skipped'
      ? `[System] ${kindLabel} payment reminder to ${to} skipped on ${today}: ${result.error || 'Resend not configured for this order type'}`
      : result.provider === 'log'
        ? `[System] ${kindLabel} payment reminder prepared for ${to} on ${today} (no email provider configured — logged only)`
        : `[System] ${kindLabel} payment reminder to ${to} failed on ${today}: ${result.error || 'unknown error'}`;

  await logActivity('invoice', invoiceId, session.userId, 'activity', session.name, msg);
  if (inv.order_id) {
    await logActivity('order', inv.order_id, session.userId, 'activity', session.name, msg);
  }

  if (!result.sent && result.provider === 'skipped') {
    return NextResponse.json(
      { error: result.error || 'Resend not configured for this order type', sent: false, provider: result.provider },
      { status: 422 },
    );
  }

  if (!result.sent && result.provider === 'resend') {
    return NextResponse.json(
      { error: result.error || 'Failed to send email', sent: false, provider: result.provider },
      { status: 502 },
    );
  }

  return NextResponse.json({
    sent: result.sent,
    provider: result.provider,
    to,
    subject,
    type,
    invoice_number: inv.invoice_number,
  });
}
