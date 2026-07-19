import db from './db';
import { getInvoiceWithDetails } from './invoices';
import { logActivity } from './activity';
import {
  extractOrderNoFromYedpay,
  fetchYedpayTransactions,
  type YedpayTransaction,
  yedpayConfigured,
} from './yedpay';
import type { PaymentMethod, ReconciliationRecord, ReconciliationStatus } from './reconciliation';

const AMOUNT_TOLERANCE = 0.02;

export interface ReconciliationInput {
  deposit_time: string;
  gross_amount: number;
  payment_method: PaymentMethod;
  transaction_fee?: number;
  order_no?: string | null;
  remarks?: string | null;
  source: 'yedpay' | 'bank_upload';
  external_id?: string | null;
}

export interface MatchCandidate {
  order_id: number;
  order_no: string;
  invoice_id: number | null;
  invoice_number: string | null;
  invoice_total: number | null;
  invoice_status: string | null;
  customer_name: string | null;
}

interface OrderMatch {
  order_id: number;
  order_no: string;
  invoice_id: number | null;
  invoice_number: string | null;
  expected_amount: number | null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function netAmount(gross: number, fee: number): number {
  return round2(gross - fee);
}

function parseDateTime(value: string): Date | null {
  const s = value.trim().replace('T', ' ');
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (!m) return null;
  const [, y, mo, d, h = '0', mi = '0', se = '0'] = m;
  const dt = new Date(+y, +mo - 1, +d, +h, +mi, +se);
  return isNaN(dt.getTime()) ? null : dt;
}

function toIsoDateTime(value: string): string {
  const dt = parseDateTime(value);
  if (!dt) return value;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
}

function amountsClose(a: number, b: number): boolean {
  return Math.abs(a - b) <= AMOUNT_TOLERANCE;
}

/** Pull plausible order / invoice numbers from bank remarks. */
export function extractOrderNoFromRemarks(remarks: string): string | null {
  const text = remarks.trim();
  if (!text) return null;

  const inv = /\b(INV-\d{4}-\d{3,6})\b/i.exec(text);
  if (inv) return inv[1].toUpperCase();

  const sys = /\b([A-Z]{2,3}-\d{3,})\b/.exec(text);
  if (sys) return sys[1];

  const po = /\b(PO[#:\s-]?[A-Z0-9][A-Z0-9-]{2,})\b/i.exec(text);
  if (po) return po[1].replace(/^PO[#:\s-]?/i, '').trim() || po[1];

  const token = /\b([A-Z]\d{3,}[A-Z0-9-]*)\b/.exec(text);
  if (token) return token[1];

  return null;
}

function rowToRecord(row: Record<string, unknown>): ReconciliationRecord {
  return {
    id: row.id as number,
    order_no: (row.order_no as string) || null,
    order_id: (row.order_id as number) || null,
    invoice_id: (row.invoice_id as number) || null,
    invoice_number: (row.invoice_number as string) || null,
    deposit_time: row.deposit_time as string,
    gross_amount: row.gross_amount as number,
    payment_method: row.payment_method as PaymentMethod,
    status: row.status as ReconciliationStatus,
    transaction_fee: row.transaction_fee as number,
    net_amount: row.net_amount as number,
    remarks: (row.remarks as string) || null,
    source: row.source as 'yedpay' | 'bank_upload',
    external_id: (row.external_id as string) || null,
    matched_at: (row.matched_at as string) || null,
    created_at: row.created_at as string,
  };
}

export function listReconciliationRecords(userId: number): ReconciliationRecord[] {
  const rows = db
    .prepare(
      `SELECT r.*, i.invoice_number
       FROM reconciliation_records r
       LEFT JOIN invoices i ON i.id = r.invoice_id
       WHERE r.user_id = ?
       ORDER BY r.deposit_time DESC, r.id DESC`
    )
    .all(userId) as Record<string, unknown>[];
  return rows.map(rowToRecord);
}

export function getReconciliationRecord(userId: number, id: number): ReconciliationRecord | null {
  const row = db
    .prepare(
      `SELECT r.*, i.invoice_number
       FROM reconciliation_records r
       LEFT JOIN invoices i ON i.id = r.invoice_id
       WHERE r.id = ? AND r.user_id = ?`
    )
    .get(id, userId) as Record<string, unknown> | undefined;
  return row ? rowToRecord(row) : null;
}

function findOrderByOrderNo(userId: number, orderNo: string): OrderMatch | null {
  const normalized = orderNo.trim();
  if (!normalized) return null;

  const byPo = db
    .prepare(
      `SELECT o.id AS order_id, o.po_number AS order_no, o.system_order_no, i.id AS invoice_id, i.invoice_number, i.status AS invoice_status
       FROM orders o
       LEFT JOIN invoices i ON i.order_id = o.id AND i.user_id = o.user_id
       WHERE o.user_id = ? AND (
         LOWER(TRIM(o.po_number)) = LOWER(?)
         OR LOWER(TRIM(o.system_order_no)) = LOWER(?)
       )
       ORDER BY i.id DESC
       LIMIT 1`
    )
    .get(userId, normalized, normalized) as
    | { order_id: number; order_no: string | null; invoice_id: number | null; invoice_number: string | null; invoice_status: string | null }
    | undefined;

  if (byPo) {
    const expected = byPo.invoice_id
      ? getInvoiceWithDetails(byPo.invoice_id, userId)?.total ?? null
      : null;
    return {
      order_id: byPo.order_id,
      order_no: byPo.order_no || (byPo as { system_order_no?: string }).system_order_no || normalized,
      invoice_id: byPo.invoice_id,
      invoice_number: byPo.invoice_number,
      expected_amount: expected,
    };
  }

  const byInvoice = db
    .prepare(
      `SELECT o.id AS order_id, o.po_number AS order_no, i.id AS invoice_id, i.invoice_number, i.status AS invoice_status
       FROM invoices i
       LEFT JOIN orders o ON o.id = i.order_id AND o.user_id = i.user_id
       WHERE i.user_id = ? AND LOWER(TRIM(i.invoice_number)) = LOWER(?)
       LIMIT 1`
    )
    .get(userId, normalized) as
    | { order_id: number | null; order_no: string | null; invoice_id: number; invoice_number: string; invoice_status: string }
    | undefined;

  if (byInvoice) {
    const expected = getInvoiceWithDetails(byInvoice.invoice_id, userId)?.total ?? null;
    return {
      order_id: byInvoice.order_id || 0,
      order_no: byInvoice.order_no || normalized,
      invoice_id: byInvoice.invoice_id,
      invoice_number: byInvoice.invoice_number,
      expected_amount: expected,
    };
  }

  return null;
}

function findSecondaryMatch(
  userId: number,
  grossAmount: number,
  paymentMethod: PaymentMethod,
  depositTime: string
): OrderMatch | null {
  const dt = parseDateTime(depositTime);
  if (!dt) return null;

  const windowStart = new Date(dt.getTime() - 24 * 60 * 60 * 1000);
  const windowEnd = new Date(dt.getTime() + 24 * 60 * 60 * 1000);

  const rows = db
    .prepare(
      `SELECT o.id AS order_id, o.po_number AS order_no, o.fields_json,
              i.id AS invoice_id, i.invoice_number, i.status AS invoice_status
       FROM orders o
       LEFT JOIN invoices i ON i.order_id = o.id AND i.user_id = o.user_id
       WHERE o.user_id = ?
         AND (i.status IS NULL OR i.status != 'paid')
       ORDER BY o.id DESC`
    )
    .all(userId) as {
    order_id: number;
    order_no: string | null;
    fields_json: string;
    invoice_id: number | null;
    invoice_number: string | null;
    invoice_status: string | null;
  }[];

  const methodHints: Record<PaymentMethod, string[]> = {
    Yedpay: ['yedpay', 'yed pay'],
    FPS: ['fps', '轉數快', '轉数快', 'faster payment'],
    Payme: ['payme', 'pay me'],
  };
  const hints = methodHints[paymentMethod];

  for (const row of rows) {
    let fields: Record<string, unknown> = {};
    try {
      fields = row.fields_json ? JSON.parse(row.fields_json) : {};
    } catch {
      fields = {};
    }

    const paymentDate = String(fields.payment_date || '').trim();
    const paymentAmount = Number(String(fields.payment_amount || '').replace(/[^0-9.\-]/g, ''));
    const paymentOption = String(fields.payment_option || fields.payment_method_detail || fields.payment_bank || '')
      .toLowerCase();

    const methodOk = hints.some((h) => paymentOption.includes(h));

    const invoiceTotal = row.invoice_id
      ? getInvoiceWithDetails(row.invoice_id, userId)?.total ?? null
      : null;
    const compareAmount = invoiceTotal ?? (Number.isFinite(paymentAmount) && paymentAmount > 0 ? paymentAmount : null);
    if (compareAmount === null || !amountsClose(compareAmount, grossAmount)) continue;

    if (paymentDate) {
      const pd = parseDateTime(paymentDate);
      if (pd && (pd < windowStart || pd > windowEnd)) continue;
    } else if (paymentMethod === 'Yedpay') {
      continue;
    }

    if (paymentMethod === 'Yedpay' && !methodOk) continue;
    if (paymentMethod === 'Payme' && !methodOk) continue;

    return {
      order_id: row.order_id,
      order_no: row.order_no || `#${row.order_id}`,
      invoice_id: row.invoice_id,
      invoice_number: row.invoice_number,
      expected_amount: invoiceTotal,
    };
  }

  return null;
}

function resolveStatus(grossAmount: number, expected: number | null): ReconciliationStatus {
  if (expected === null) return 'Matched';
  return amountsClose(grossAmount, expected) ? 'Matched' : 'Discrepancy';
}

function applyMatchToInvoiceAndOrder(
  userId: number,
  recordId: number,
  match: OrderMatch,
  input: ReconciliationInput,
  status: ReconciliationStatus,
  actorName = 'System'
): void {
  const depositTime = toIsoDateTime(input.deposit_time);
  const fee = input.transaction_fee ?? 0;
  const net = netAmount(input.gross_amount, fee);

  db.prepare(
    `UPDATE reconciliation_records
     SET order_no = ?, order_id = ?, invoice_id = ?, status = ?, matched_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`
  ).run(
    match.order_no,
    match.order_id || null,
    match.invoice_id,
    status,
    recordId,
    userId
  );

  if (match.invoice_id && status === 'Matched') {
    db.prepare(
      `UPDATE invoices SET status = 'paid', updated_at = datetime('now') WHERE id = ? AND user_id = ? AND status != 'paid'`
    ).run(match.invoice_id, userId);
    logActivity(
      'invoice',
      match.invoice_id,
      userId,
      'activity',
      actorName,
      `Reconciliation #${recordId}: marked invoice paid via ${input.payment_method} (${input.gross_amount.toFixed(2)} HKD)`
    );
  }

  if (match.order_id) {
    const existing = db
      .prepare('SELECT fields_json FROM orders WHERE id = ? AND user_id = ?')
      .get(match.order_id, userId) as { fields_json: string } | undefined;
    if (existing) {
      let fields: Record<string, unknown> = {};
      try {
        fields = existing.fields_json ? JSON.parse(existing.fields_json) : {};
      } catch {
        fields = {};
      }
      const merged = {
        ...fields,
        payment_date: depositTime.slice(0, 10),
        payment_amount: String(input.gross_amount),
        payment_method_detail: input.payment_method,
        payment_verified: status === 'Matched',
        payment_status_label: status === 'Matched' ? 'Full Paid' : fields.payment_status_label,
      };
      db.prepare(`UPDATE orders SET fields_json = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`).run(
        JSON.stringify(merged),
        match.order_id,
        userId
      );
      logActivity(
        'order',
        match.order_id,
        userId,
        'activity',
        actorName,
        `Reconciliation #${recordId}: ${status} with ${input.payment_method} deposit ${input.gross_amount.toFixed(2)} HKD (net ${net.toFixed(2)})`
      );
    }
  }
}

export function insertReconciliationRecord(userId: number, input: ReconciliationInput): number {
  const fee = input.transaction_fee ?? 0;
  const net = netAmount(input.gross_amount, fee);
  const depositTime = toIsoDateTime(input.deposit_time);

  const result = db
    .prepare(
      `INSERT INTO reconciliation_records
       (user_id, order_no, deposit_time, gross_amount, payment_method, status, transaction_fee, net_amount,
        remarks, source, external_id)
       VALUES (?, ?, ?, ?, ?, 'Unmatched', ?, ?, ?, ?, ?)`
    )
    .run(
      userId,
      input.order_no?.trim() || null,
      depositTime,
      round2(input.gross_amount),
      input.payment_method,
      round2(fee),
      net,
      input.remarks?.trim() || null,
      input.source,
      input.external_id || null
    );

  return Number(result.lastInsertRowid);
}

function recordExistsByExternalId(userId: number, externalId: string): boolean {
  const row = db
    .prepare('SELECT 1 FROM reconciliation_records WHERE user_id = ? AND external_id = ?')
    .get(userId, externalId);
  return Boolean(row);
}

export function attemptAutoMatch(userId: number, recordId: number, input: ReconciliationInput): ReconciliationStatus {
  const orderNo =
    input.order_no?.trim() ||
    (input.remarks ? extractOrderNoFromRemarks(input.remarks) : null);

  let match: OrderMatch | null = null;
  if (orderNo) match = findOrderByOrderNo(userId, orderNo);
  if (!match) match = findSecondaryMatch(userId, input.gross_amount, input.payment_method, input.deposit_time);

  if (!match) return 'Unmatched';

  const status = resolveStatus(input.gross_amount, match.expected_amount);
  applyMatchToInvoiceAndOrder(userId, recordId, match, input, status);
  return status;
}

export function manualMatchRecord(
  userId: number,
  recordId: number,
  invoiceId: number,
  actorName: string
): ReconciliationRecord | null {
  const record = getReconciliationRecord(userId, recordId);
  if (!record) return null;

  const invoice = getInvoiceWithDetails(invoiceId, userId);
  if (!invoice) return null;

  let orderNo = record.order_no;
  let orderId = invoice.order_id || 0;
  if (invoice.order_id) {
    const orderRow = db
      .prepare('SELECT id, po_number FROM orders WHERE id = ? AND user_id = ?')
      .get(invoice.order_id, userId) as { id: number; po_number: string | null } | undefined;
    if (orderRow) {
      orderId = orderRow.id;
      orderNo = orderRow.po_number || orderNo;
    }
  }

  const match: OrderMatch = {
    order_id: orderId,
    order_no: orderNo || invoice.invoice_number,
    invoice_id: invoice.id,
    invoice_number: invoice.invoice_number,
    expected_amount: invoice.total,
  };

  const status = resolveStatus(record.gross_amount, invoice.total);
  applyMatchToInvoiceAndOrder(
    userId,
    recordId,
    match,
    {
      deposit_time: record.deposit_time,
      gross_amount: record.gross_amount,
      payment_method: record.payment_method,
      transaction_fee: record.transaction_fee,
      order_no: match.order_no,
      remarks: record.remarks,
      source: record.source,
    },
    status,
    actorName
  );

  return getReconciliationRecord(userId, recordId);
}

export function listMatchCandidates(userId: number): MatchCandidate[] {
  const rows = db
    .prepare(
      `SELECT o.id AS order_id, o.po_number AS order_no, o.name AS customer_name,
              i.id AS invoice_id, i.invoice_number, i.status AS invoice_status
       FROM invoices i
       LEFT JOIN orders o ON o.id = i.order_id AND o.user_id = i.user_id
       WHERE i.user_id = ? AND i.status != 'paid'
       ORDER BY i.issue_date DESC, i.id DESC`
    )
    .all(userId) as {
    order_id: number | null;
    order_no: string | null;
    customer_name: string | null;
    invoice_id: number;
    invoice_number: string;
    invoice_status: string;
  }[];

  return rows.map((r) => ({
    order_id: r.order_id || 0,
    order_no: r.order_no || '',
    invoice_id: r.invoice_id,
    invoice_number: r.invoice_number,
    invoice_total: getInvoiceWithDetails(r.invoice_id, userId)?.total ?? null,
    invoice_status: r.invoice_status,
    customer_name: r.customer_name,
  }));
}

function yedpayTxnToInput(txn: YedpayTransaction): ReconciliationInput {
  const gross = Number(txn.amount);
  const fee = Number(txn.charge) || 0;
  const deposit = txn.settled_at || txn.paid_at || txn.created_at || new Date().toISOString();
  return {
    deposit_time: deposit,
    gross_amount: gross,
    payment_method: 'Yedpay',
    transaction_fee: fee,
    order_no: extractOrderNoFromYedpay(txn),
    remarks: txn.transaction_id ? `Yedpay ${txn.transaction_id}` : null,
    source: 'yedpay',
    external_id: txn.id,
  };
}

export async function syncYedpayForUser(userId: number): Promise<{
  fetched: number;
  imported: number;
  matched: number;
  skipped: number;
}> {
  if (!yedpayConfigured()) {
    throw new Error('Yedpay is not configured (set YEDPAY_ACCESS_TOKEN and YEDPAY_USER_ID)');
  }

  const sinceRow = db
    .prepare(
      `SELECT MAX(deposit_time) AS last FROM reconciliation_records WHERE user_id = ? AND source = 'yedpay'`
    )
    .get(userId) as { last: string | null };

  const transactions = await fetchYedpayTransactions({
    since: sinceRow.last || undefined,
  });

  let imported = 0;
  let matched = 0;
  let skipped = 0;

  const run = db.transaction(() => {
    for (const txn of transactions) {
      if (txn.status !== 'paid') {
        skipped += 1;
        continue;
      }
      if (recordExistsByExternalId(userId, txn.id)) {
        skipped += 1;
        continue;
      }

      const input = yedpayTxnToInput(txn);
      const id = insertReconciliationRecord(userId, input);
      imported += 1;
      const status = attemptAutoMatch(userId, id, input);
      if (status === 'Matched' || status === 'Discrepancy') matched += 1;
    }
  });
  run();

  return { fetched: transactions.length, imported, matched, skipped };
}

export function importBankStatementRows(
  userId: number,
  paymentMethod: PaymentMethod,
  rows: ReconciliationInput[]
): { imported: number; matched: number; skipped: number } {
  let imported = 0;
  let matched = 0;
  let skipped = 0;

  const run = db.transaction(() => {
    for (const row of rows) {
      if (row.external_id && recordExistsByExternalId(userId, row.external_id)) {
        skipped += 1;
        continue;
      }
      const input: ReconciliationInput = {
        ...row,
        payment_method: paymentMethod,
        transaction_fee: 0,
        source: 'bank_upload',
      };
      const id = insertReconciliationRecord(userId, input);
      imported += 1;
      const status = attemptAutoMatch(userId, id, input);
      if (status === 'Matched' || status === 'Discrepancy') matched += 1;
    }
  });
  run();

  return { imported, matched, skipped };
}
