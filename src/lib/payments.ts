import db from './db';
import type { PaymentWithDetails, UnclaimedDepositWithDetails } from './types';
import { getTeamUserIds } from './team';

function teamPlaceholders(userId: number) {
  const ids = getTeamUserIds(userId);
  return { ids, placeholders: ids.map(() => '?').join(', ') };
}

export function getPaymentWithDetails(paymentId: number, userId: number): PaymentWithDetails | null {
  const { ids, placeholders } = teamPlaceholders(userId);
  const row = db
    .prepare(
      `SELECT p.*,
              i.invoice_number,
              c.name as customer_name,
              creator.name as created_by_name,
              verifier.name as verified_by_name
       FROM payments p
       JOIN invoices i ON i.id = p.invoice_id
       JOIN customers c ON c.id = i.customer_id
       JOIN users creator ON creator.id = p.created_by
       LEFT JOIN users verifier ON verifier.id = p.verified_by
       WHERE p.id = ? AND p.user_id IN (${placeholders})`
    )
    .get(paymentId, ...ids) as PaymentWithDetails | undefined;

  return row ?? null;
}

export function getPaymentsByStatus(userId: number, status: string): PaymentWithDetails[] {
  const { ids, placeholders } = teamPlaceholders(userId);
  const rows = db
    .prepare(
      `SELECT p.id FROM payments p WHERE p.user_id IN (${placeholders}) AND p.status = ? ORDER BY p.created_at DESC`
    )
    .all(...ids, status) as { id: number }[];

  return rows.map((r) => getPaymentWithDetails(r.id, userId)).filter(Boolean) as PaymentWithDetails[];
}

export function getUnclaimedDeposits(userId: number): UnclaimedDepositWithDetails[] {
  const { ids, placeholders } = teamPlaceholders(userId);
  return db
    .prepare(
      `SELECT d.*,
              creator.name as created_by_name,
              claimer.name as claimed_by_name,
              i.invoice_number as claimed_invoice_number
       FROM unclaimed_deposits d
       JOIN users creator ON creator.id = d.created_by
       LEFT JOIN users claimer ON claimer.id = d.claimed_by
       LEFT JOIN invoices i ON i.id = d.claimed_invoice_id
       WHERE d.user_id IN (${placeholders}) AND d.status = 'unclaimed'
       ORDER BY d.deposit_date DESC, d.created_at DESC`
    )
    .all(...ids) as UnclaimedDepositWithDetails[];
}

export function getInvoicePayments(invoiceId: number, userId: number): PaymentWithDetails[] {
  const { ids, placeholders } = teamPlaceholders(userId);
  const rows = db
    .prepare(`SELECT id FROM payments WHERE invoice_id = ? AND user_id IN (${placeholders}) ORDER BY created_at DESC`)
    .all(invoiceId, ...ids) as { id: number }[];

  return rows.map((r) => getPaymentWithDetails(r.id, userId)).filter(Boolean) as PaymentWithDetails[];
}

export function markInvoicePaidIfFullyCleared(invoiceId: number, userId: number) {
  const invoice = db
    .prepare(
      `SELECT i.id,
              COALESCE(SUM(ii.amount), 0) * (1 + i.tax_rate / 100.0) as total
       FROM invoices i
       JOIN invoice_items ii ON ii.invoice_id = i.id
       WHERE i.id = ? AND i.user_id = ?
       GROUP BY i.id`
    )
    .get(invoiceId, userId) as { id: number; total: number } | undefined;

  if (!invoice) return;

  const cleared = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM payments
       WHERE invoice_id = ? AND user_id = ? AND status = 'bank_cleared'`
    )
    .get(invoiceId, userId) as { total: number };

  if (cleared.total >= invoice.total) {
    db.prepare(`UPDATE invoices SET status = 'paid', updated_at = datetime('now') WHERE id = ? AND user_id = ?`).run(
      invoiceId,
      userId
    );
  }
}
