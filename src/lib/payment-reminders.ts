/** Client-safe payment-reminder helpers (no DB). */

export type ReminderType = 'overdue' | 'due_soon';

export const DUE_SOON_DAYS = 7;

export interface ReminderCandidate {
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
  /** Invoice-level email field (preferred recipient when set). */
  invoice_email: string | null;
  /** Linked order's fields.order_type when present. */
  order_type: string | null;
  total: number;
  type: ReminderType;
  /** Days past due (overdue) or days until due (due soon). */
  daysOffset: number;
  to: string | null;
  subject: string;
  body: string;
}

export function defaultReminderSubject(type: ReminderType, invoiceNumber: string): string {
  if (type === 'due_soon') {
    return `Payment due soon: Invoice ${invoiceNumber}`;
  }
  return `Payment overdue: Invoice ${invoiceNumber}`;
}

export function defaultReminderBody(
  type: ReminderType,
  invoiceNumber: string,
  total: number,
  daysOffset: number,
  dueDate?: string,
): string {
  const totalText = Number.isFinite(total) ? total.toFixed(2) : '';
  const amount = totalText ? ` (total ${totalText})` : '';
  const dueLine = dueDate ? `\nDue date: ${dueDate}` : '';

  if (type === 'due_soon') {
    const when =
      daysOffset <= 0
        ? 'today'
        : daysOffset === 1
          ? 'tomorrow'
          : `in ${daysOffset} days`;
    return [
      `This is a friendly reminder that invoice ${invoiceNumber}${amount} is due ${when}.${dueLine}`,
      '',
      'Please arrange payment by the due date.',
      '',
      'Thank you,',
      'Honour Label Limited',
    ].join('\n');
  }

  return [
    `This is a friendly reminder that invoice ${invoiceNumber}${amount} is overdue${
      daysOffset > 0 ? ` by ${daysOffset} day${daysOffset === 1 ? '' : 's'}` : ''
    }.${dueLine}`,
    '',
    'Please arrange payment at your earliest convenience.',
    '',
    'Thank you,',
    'Honour Label Limited',
  ].join('\n');
}

/** Convert plain-text email body to simple HTML for Resend. */
export function plainTextToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const paragraphs = escaped
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, '<br/>')}</p>`)
    .join('');
  return paragraphs || '<p></p>';
}
