import db from './db';
import type { BankStatementRow } from './bank-statement';
import { amountsEqual, daysBetween } from './bank-statement';
import {
  getPaymentWithDetails,
  markInvoicePaidIfFullyCleared,
} from './payments';
import { getTeamUserIds } from './team';

export interface ReconcilablePayment {
  id: number;
  invoice_id: number;
  invoice_number: string;
  customer_name: string;
  amount: number;
  payment_date: string;
  receipt_note: string | null;
  status: string;
}

export interface ExactMatchResult {
  row: BankStatementRow;
  paymentId: number;
  invoiceNumber: string;
  customerName: string;
  matchType: 'reference';
}

export interface SuggestedMatchResult {
  row: BankStatementRow;
  paymentId: number;
  invoiceNumber: string;
  customerName: string;
  amount: number;
  bankDate: string;
  paymentDate: string;
  daysDiff: number;
  matchType: 'fuzzy';
}

export interface UnclaimedCreatedResult {
  row: BankStatementRow;
  depositId: number;
}

export interface ReconciliationResult {
  exactMatches: ExactMatchResult[];
  suggestedMatches: SuggestedMatchResult[];
  unclaimedCreated: UnclaimedCreatedResult[];
  skipped: number;
}

export function getTeamPendingPayments(userId: number): ReconcilablePayment[] {
  const teamIds = getTeamUserIds(userId);
  const placeholders = teamIds.map(() => '?').join(', ');

  return db
    .prepare(
      `SELECT p.id, p.invoice_id, p.amount, p.payment_date, p.receipt_note, p.status,
              i.invoice_number, c.name as customer_name
       FROM payments p
       JOIN invoices i ON i.id = p.invoice_id
       JOIN customers c ON c.id = i.customer_id
       WHERE p.user_id IN (${placeholders})
         AND p.status = 'pending_verification'
       ORDER BY p.created_at DESC`
    )
    .all(...teamIds) as ReconcilablePayment[];
}

export function getTeamInvoiceNumbers(userId: number): { id: number; invoice_number: string }[] {
  const teamIds = getTeamUserIds(userId);
  const placeholders = teamIds.map(() => '?').join(', ');

  return db
    .prepare(
      `SELECT id, invoice_number FROM invoices
       WHERE user_id IN (${placeholders})
       ORDER BY LENGTH(invoice_number) DESC`
    )
    .all(...teamIds) as { id: number; invoice_number: string }[];
}

function unclaimedExists(
  userId: number,
  depositDate: string,
  amount: number,
  remarks: string
): boolean {
  const teamIds = getTeamUserIds(userId);
  const placeholders = teamIds.map(() => '?').join(', ');

  const existing = db
    .prepare(
      `SELECT id FROM unclaimed_deposits
       WHERE user_id IN (${placeholders})
         AND status = 'unclaimed'
         AND deposit_date = ?
         AND ABS(amount - ?) < 0.01
         AND COALESCE(remarks, '') = ?`
    )
    .get(...teamIds, depositDate, amount, remarks);

  return !!existing;
}

export function verifyPaymentRecord(
  paymentId: number,
  userId: number,
  verifierId: number
): boolean {
  const teamIds = getTeamUserIds(userId);
  const placeholders = teamIds.map(() => '?').join(', ');

  const payment = db
    .prepare(
      `SELECT invoice_id FROM payments
       WHERE id = ? AND user_id IN (${placeholders})
         AND status = 'pending_verification' AND locked = 0`
    )
    .get(paymentId, ...teamIds) as { invoice_id: number } | undefined;

  if (!payment) return false;

  db.prepare(
    `UPDATE payments
     SET status = 'bank_cleared',
         verified_at = datetime('now'),
         verified_by = ?,
         locked = 1
     WHERE id = ?`
  ).run(verifierId, paymentId);

  markInvoicePaidIfFullyCleared(payment.invoice_id, userId);
  return true;
}

function createBankClearedPayment(
  userId: number,
  invoiceId: number,
  amount: number,
  paymentDate: string,
  note: string,
  verifierId: number
): number {
  const result = db
    .prepare(
      `INSERT INTO payments (
        user_id, invoice_id, amount, payment_date, receipt_note,
        status, verified_at, verified_by, locked, created_by
      ) VALUES (?, ?, ?, ?, ?, 'bank_cleared', datetime('now'), ?, 1, ?)`
    )
    .run(userId, invoiceId, amount, paymentDate, note, verifierId, verifierId);

  const paymentId = result.lastInsertRowid as number;
  markInvoicePaidIfFullyCleared(invoiceId, userId);
  return paymentId;
}

function findExactMatch(
  row: BankStatementRow,
  pendingPayments: ReconcilablePayment[],
  invoiceNumbers: { id: number; invoice_number: string }[],
  matchedPaymentIds: Set<number>
): { paymentId: number; invoiceId?: number; invoiceNumber: string; customerName: string } | null {
  const descUpper = row.description.toUpperCase();

  for (const payment of pendingPayments) {
    if (matchedPaymentIds.has(payment.id)) continue;

    if (payment.receipt_note && payment.receipt_note.length >= 3) {
      if (descUpper.includes(payment.receipt_note.toUpperCase())) {
        return {
          paymentId: payment.id,
          invoiceNumber: payment.invoice_number,
          customerName: payment.customer_name,
        };
      }
    }

    if (descUpper.includes(payment.invoice_number.toUpperCase())) {
      return {
        paymentId: payment.id,
        invoiceNumber: payment.invoice_number,
        customerName: payment.customer_name,
      };
    }
  }

  for (const inv of invoiceNumbers) {
    if (descUpper.includes(inv.invoice_number.toUpperCase())) {
      const payment = pendingPayments.find(
        (p) => p.invoice_id === inv.id && !matchedPaymentIds.has(p.id)
      );
      if (payment) {
        return {
          paymentId: payment.id,
          invoiceNumber: payment.invoice_number,
          customerName: payment.customer_name,
        };
      }
      return {
        paymentId: 0,
        invoiceId: inv.id,
        invoiceNumber: inv.invoice_number,
        customerName: '',
      };
    }
  }

  return null;
}

function findFuzzyMatch(
  row: BankStatementRow,
  pendingPayments: ReconcilablePayment[],
  matchedPaymentIds: Set<number>
): ReconcilablePayment | null {
  for (const payment of pendingPayments) {
    if (matchedPaymentIds.has(payment.id)) continue;
    if (!amountsEqual(payment.amount, row.depositAmount)) continue;
    if (daysBetween(payment.payment_date, row.transactionDate) > 3) continue;
    return payment;
  }
  return null;
}

export function reconcileBankStatement(
  rows: BankStatementRow[],
  userId: number,
  verifierId: number,
  bankName: string
): ReconciliationResult {
  const pendingPayments = getTeamPendingPayments(userId);
  const invoiceNumbers = getTeamInvoiceNumbers(userId);
  const matchedPaymentIds = new Set<number>();

  const exactMatches: ExactMatchResult[] = [];
  const suggestedMatches: SuggestedMatchResult[] = [];
  const unclaimedCreated: UnclaimedCreatedResult[] = [];
  let skipped = 0;

  for (const row of rows) {
    const exact = findExactMatch(row, pendingPayments, invoiceNumbers, matchedPaymentIds);

    if (exact) {
      if (exact.paymentId > 0) {
        verifyPaymentRecord(exact.paymentId, userId, verifierId);
        matchedPaymentIds.add(exact.paymentId);
        const payment = getPaymentWithDetails(exact.paymentId, userId);
        exactMatches.push({
          row,
          paymentId: exact.paymentId,
          invoiceNumber: payment?.invoice_number ?? exact.invoiceNumber,
          customerName: payment?.customer_name ?? exact.customerName,
          matchType: 'reference',
        });
      } else if (exact.invoiceId) {
        const paymentId = createBankClearedPayment(
          userId,
          exact.invoiceId,
          row.depositAmount,
          row.transactionDate,
          `Auto-matched from bank statement: ${row.description}`,
          verifierId
        );
        matchedPaymentIds.add(paymentId);
        exactMatches.push({
          row,
          paymentId,
          invoiceNumber: exact.invoiceNumber,
          customerName: exact.customerName,
          matchType: 'reference',
        });
      }
      continue;
    }

    const fuzzy = findFuzzyMatch(row, pendingPayments, matchedPaymentIds);
    if (fuzzy) {
      suggestedMatches.push({
        row,
        paymentId: fuzzy.id,
        invoiceNumber: fuzzy.invoice_number,
        customerName: fuzzy.customer_name,
        amount: fuzzy.amount,
        bankDate: row.transactionDate,
        paymentDate: fuzzy.payment_date,
        daysDiff: daysBetween(fuzzy.payment_date, row.transactionDate),
        matchType: 'fuzzy',
      });
      continue;
    }

    if (unclaimedExists(userId, row.transactionDate, row.depositAmount, row.description)) {
      skipped++;
      continue;
    }

    const result = db
      .prepare(
        `INSERT INTO unclaimed_deposits (user_id, deposit_date, amount, bank, remarks, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        userId,
        row.transactionDate,
        row.depositAmount,
        bankName,
        row.description,
        verifierId
      );

    unclaimedCreated.push({
      row,
      depositId: result.lastInsertRowid as number,
    });
  }

  return { exactMatches, suggestedMatches, unclaimedCreated, skipped };
}

export function confirmSuggestedMatches(
  paymentIds: number[],
  userId: number,
  verifierId: number
): number {
  let confirmed = 0;
  for (const paymentId of paymentIds) {
    if (verifyPaymentRecord(paymentId, userId, verifierId)) {
      confirmed++;
    }
  }
  return confirmed;
}
