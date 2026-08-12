import db from '@/lib/db';
import { getInvoiceWithDetails, markSentInvoicesOverdue } from '@/lib/invoices';
import {
  DUE_SOON_DAYS,
  defaultReminderBody,
  defaultReminderSubject,
  type ReminderCandidate,
  type ReminderType,
} from '@/lib/payment-reminders';

function reminderCooldownDays(): number {
  return Number(process.env.REMINDER_DAYS || 30);
}

type ReminderRow = {
  id: number;
  user_id: number;
  invoice_number: string;
  status: string;
  order_id: number | null;
  issue_date: string;
  due_date: string;
  created_at: string;
  last_reminder_at: string | null;
  last_due_soon_reminder_at: string | null;
  customer_name: string | null;
  customer_email: string | null;
  order_email: string | null;
  invoice_email: string | null;
  order_fields_json: string | null;
};

function orderTypeFromFieldsJson(json: string | null | undefined): string | null {
  if (!json?.trim()) return null;
  try {
    const fields = JSON.parse(json) as Record<string, unknown>;
    const t = fields.order_type;
    return typeof t === 'string' && t.trim() ? t.trim() : null;
  } catch {
    return null;
  }
}

function preferEmail(...candidates: Array<string | null | undefined>): string | null {
  for (const raw of candidates) {
    const v = (raw || '').trim();
    if (v) return v;
  }
  return null;
}

function userFilter(userId: number | null, params: (number | string)[]): string {
  if (userId === null) return '';
  params.push(userId);
  return ' AND i.user_id = ?';
}

async function toCandidate(row: ReminderRow, type: ReminderType, daysOffset: number): Promise<ReminderCandidate> {
  const details = await getInvoiceWithDetails(row.id, row.user_id);
  const total = details?.total ?? 0;
  const to = preferEmail(row.invoice_email, row.order_email, row.customer_email);
  const { order_fields_json, ...rest } = row;
  return {
    ...rest,
    order_type: orderTypeFromFieldsJson(order_fields_json),
    total,
    type,
    daysOffset,
    to,
    subject: defaultReminderSubject(type, row.invoice_number),
    body: defaultReminderBody(type, row.invoice_number, total, daysOffset, row.due_date || undefined),
  };
}

/**
 * Unpaid invoices needing an overdue or due-soon reminder.
 * When `userId` is null, returns candidates for every user (cron mode).
 * Optional `types` limits which kinds are returned (default: both).
 */
export async function listReminderCandidates(
  userId: number | null,
  types: ReminderType[] = ['overdue', 'due_soon'],
): Promise<{
  overdueDays: number;
  dueSoonDays: number;
  candidates: ReminderCandidate[];
}> {
  const overdueDays = reminderCooldownDays();
  const dueSoonDays = DUE_SOON_DAYS;
  const wantOverdue = types.includes('overdue');
  const wantDueSoon = types.includes('due_soon');
  const candidates: ReminderCandidate[] = [];

  await markSentInvoicesOverdue(userId);

  if (wantOverdue) {
    const params: (number | string)[] = [overdueDays];
    const query = `
      SELECT i.id, i.user_id, i.invoice_number, i.status, i.order_id, i.issue_date, i.due_date,
             i.created_at, i.last_reminder_at, i.last_due_soon_reminder_at,
             i.email AS invoice_email,
             c.name AS customer_name, c.email AS customer_email,
             o.customer_email AS order_email,
             o.fields_json AS order_fields_json,
             (CURRENT_DATE - i.due_date::date) AS days_past_due
      FROM invoices i
      LEFT JOIN customers c ON c.id = i.customer_id
      LEFT JOIN orders o ON o.id = i.order_id
      WHERE i.status != 'paid'
        AND i.due_date IS NOT NULL AND trim(i.due_date) != ''
        AND i.due_date::date < CURRENT_DATE
        AND (i.last_reminder_at IS NULL OR (CURRENT_DATE - i.last_reminder_at::date) >= ?)
        ${userFilter(userId, params)}
      ORDER BY i.due_date ASC`;
    const rows = await db.prepare(query).all(...params) as Array<ReminderRow & { days_past_due: number }>;
    for (const row of rows) {
      candidates.push(await toCandidate(row, 'overdue', Math.max(0, Number(row.days_past_due) || 0)));
    }
  }

  if (wantDueSoon) {
    const params: (number | string)[] = [dueSoonDays];
    const query = `
      SELECT i.id, i.user_id, i.invoice_number, i.status, i.order_id, i.issue_date, i.due_date,
             i.created_at, i.last_reminder_at, i.last_due_soon_reminder_at,
             i.email AS invoice_email,
             c.name AS customer_name, c.email AS customer_email,
             o.customer_email AS order_email,
             o.fields_json AS order_fields_json,
             (i.due_date::date - CURRENT_DATE) AS days_until_due
      FROM invoices i
      LEFT JOIN customers c ON c.id = i.customer_id
      LEFT JOIN orders o ON o.id = i.order_id
      WHERE i.status != 'paid'
        AND i.due_date IS NOT NULL AND trim(i.due_date) != ''
        AND i.due_date::date >= CURRENT_DATE
        AND (i.due_date::date - CURRENT_DATE) <= ?
        AND i.last_due_soon_reminder_at IS NULL
        ${userFilter(userId, params)}
      ORDER BY i.due_date ASC`;
    const rows = await db.prepare(query).all(...params) as Array<ReminderRow & { days_until_due: number }>;
    for (const row of rows) {
      candidates.push(await toCandidate(row, 'due_soon', Math.max(0, Number(row.days_until_due) || 0)));
    }
  }

  candidates.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'overdue' ? -1 : 1;
    return a.due_date.localeCompare(b.due_date);
  });

  return { overdueDays, dueSoonDays, candidates };
}
