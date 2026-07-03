// Minimal email sender. Uses Resend's HTTP API when RESEND_API_KEY is configured;
// otherwise it logs the message (so reminder flows are testable without a provider).
export interface SendResult {
  sent: boolean;
  provider: 'resend' | 'log';
  error?: string;
}

export async function sendEmail(to: string, subject: string, html: string): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.REMINDER_FROM_EMAIL || 'InvoiceFlow <onboarding@resend.dev>';

  if (!apiKey) {
    console.log(`[email:log-only] to=${to} subject="${subject}"`);
    return { sent: false, provider: 'log' };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) {
      const error = await res.text();
      return { sent: false, provider: 'resend', error };
    }
    return { sent: true, provider: 'resend' };
  } catch (e) {
    return { sent: false, provider: 'resend', error: String(e) };
  }
}
