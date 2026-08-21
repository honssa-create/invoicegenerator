import db from './db';
import { getInvoiceWithDetails, invoiceTotalsByIds } from './invoices';
import { logActivity } from './activity';
import {
  extractOrderNoFromYedpay,
  fetchYedpayTransactions,
  type YedpayTransaction,
  yedpayConfigured,
} from './yedpay';
import {
  amountsClose,
  classifyMediumCandidates,
  isWithinHours,
  MEDIUM_MATCH_WINDOW_HOURS,
  paymentMethodMatches,
  type PaymentMethod,
  type ReconCandidateSummary,
  type ReconConfidence,
  type ReconciliationRecord,
  type ReconciliationStatus,
} from './reconciliation';
import {
  computeOrderPaidTotal,
  derivePaymentStatusLabel,
  normalizePaymentSlot,
  paymentSlotFields,
  type PaymentSlot,
} from './orders';

export interface ReconciliationInput {
  deposit_time: string;
  gross_amount: number;
  payment_method: PaymentMethod;
  transaction_fee?: number;
  order_no?: string | null;
  remarks?: string | null;
  receipt_path?: string | null;
  source: 'yedpay' | 'bank_upload' | 'manual';
  external_id?: string | null;
  created_by?: string | null;
}

export interface MatchCandidate {
  order_id: number;
  order_no: string;
  invoice_id: number | null;
  invoice_number: string | null;
  invoice_total: number | null;
  invoice_status: string | null;
  customer_name: string | null;
  phone: string | null;
}

interface OrderMatch {
  order_id: number;
  order_no: string;
  invoice_id: number | null;
  invoice_number: string | null;
  expected_amount: number | null;
  customer_name?: string | null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function netAmount(gross: number, fee: number): number {
  return round2(gross - fee);
}

export function parseDateTime(value: string): Date | null {
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

function nowIso(): string {
  const dt = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())} ${pad(dt.getUTCHours())}:${pad(dt.getUTCMinutes())}:${pad(dt.getUTCSeconds())}`;
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

function parseCandidatesJson(raw: unknown): ReconCandidateSummary[] {
  if (!raw || typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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
    receipt_path: (row.receipt_path as string) || null,
    source: row.source as 'yedpay' | 'bank_upload' | 'manual',
    external_id: (row.external_id as string) || null,
    matched_at: (row.matched_at as string) || null,
    confidence: (row.confidence as ReconConfidence) || null,
    suggested_order_id: (row.suggested_order_id as number) || null,
    suggested_invoice_id: (row.suggested_invoice_id as number) || null,
    candidates: parseCandidatesJson(row.candidate_order_ids_json),
    approved_by: (row.approved_by as string) || null,
    approved_at: (row.approved_at as string) || null,
    created_by: (row.created_by as string) || null,
    created_at: row.created_at as string,
    payment_slot: (row.payment_slot as number) || null,
    suggested_order_no: (row.suggested_order_no as string) || null,
    suggested_customer_name: (row.suggested_customer_name as string) || null,
    suggested_invoice_number: (row.suggested_invoice_number as string) || null,
  };
}

const LIST_SELECT = `SELECT r.*,
       COALESCE(i.invoice_number, si.invoice_number) AS invoice_number,
       so.po_number AS suggested_order_no,
       so.name AS suggested_customer_name,
       si.invoice_number AS suggested_invoice_number
       FROM reconciliation_records r
       LEFT JOIN invoices i ON i.id = r.invoice_id
       LEFT JOIN orders so ON so.id = r.suggested_order_id
       LEFT JOIN invoices si ON si.id = r.suggested_invoice_id`;

export async function listReconciliationRecords(userId: number): Promise<ReconciliationRecord[]> {
  const rows = await db
    .prepare(
      `${LIST_SELECT}
       WHERE r.user_id = ?
       ORDER BY r.deposit_time DESC, r.id DESC`
    )
    .all(userId) as Record<string, unknown>[];

  const records = rows.map(rowToRecord);
  const suggestedIds = records
    .map((r) => r.suggested_invoice_id)
    .filter((id): id is number => typeof id === 'number' && id > 0);
  const totals = await invoiceTotalsByIds(userId, suggestedIds);
  for (const r of records) {
    if (r.suggested_invoice_id) {
      r.suggested_amount = totals.get(r.suggested_invoice_id) ?? null;
    }
  }
  return records;
}

export async function getReconciliationRecord(userId: number, id: number): Promise<ReconciliationRecord | null> {
  const row = await db
    .prepare(
      `${LIST_SELECT}
       WHERE r.id = ? AND r.user_id = ?`
    )
    .get(id, userId) as Record<string, unknown> | undefined;
  if (!row) return null;
  const record = rowToRecord(row);
  if (record.suggested_invoice_id) {
    record.suggested_amount = (await getInvoiceWithDetails(record.suggested_invoice_id, userId))?.total ?? null;
  }
  return record;
}

async function findOrderByOrderNo(userId: number, orderNo: string): Promise<OrderMatch | null> {
  const normalized = orderNo.trim();
  if (!normalized) return null;

  const byPo = await db
    .prepare(
      `SELECT o.id AS order_id, o.po_number AS order_no, o.system_order_no, o.reference_number, o.name AS customer_name,
              i.id AS invoice_id, i.invoice_number, i.status AS invoice_status
       FROM orders o
       LEFT JOIN invoices i ON i.order_id = o.id AND i.user_id = o.user_id
       WHERE o.user_id = ? AND (
         LOWER(TRIM(o.po_number)) = LOWER(?)
         OR LOWER(TRIM(o.system_order_no)) = LOWER(?)
         OR LOWER(TRIM(o.reference_number)) = LOWER(?)
       )
       ORDER BY CASE WHEN i.status IS NOT NULL AND i.status != 'paid' THEN 0 ELSE 1 END, i.id DESC
       LIMIT 1`
    )
    .get(userId, normalized, normalized, normalized) as
    | {
        order_id: number;
        order_no: string | null;
        invoice_id: number | null;
        invoice_number: string | null;
        invoice_status: string | null;
        customer_name: string | null;
        reference_number?: string;
        system_order_no?: string;
      }
    | undefined;

  if (byPo) {
    let expected = byPo.invoice_id
      ? (await getInvoiceWithDetails(byPo.invoice_id, userId))?.total ?? null
      : null;
    if (expected === null) {
      const fieldsRow = (await db
        .prepare('SELECT fields_json FROM orders WHERE id = ? AND user_id = ?')
        .get(byPo.order_id, userId)) as { fields_json: string } | undefined;
      try {
        const fields = fieldsRow?.fields_json ? JSON.parse(fieldsRow.fields_json) : {};
        const amt = Number(String(fields.payment_amount || '').replace(/[^0-9.\-]/g, ''));
        if (Number.isFinite(amt) && amt > 0) expected = amt;
      } catch {
        /* ignore */
      }
    }
    return {
      order_id: byPo.order_id,
      order_no: byPo.reference_number || byPo.order_no || byPo.system_order_no || normalized,
      invoice_id: byPo.invoice_id,
      invoice_number: byPo.invoice_number,
      expected_amount: expected,
      customer_name: byPo.customer_name,
    };
  }

  const byInvoice = await db
    .prepare(
      `SELECT o.id AS order_id, o.po_number AS order_no, o.name AS customer_name,
              i.id AS invoice_id, i.invoice_number, i.status AS invoice_status
       FROM invoices i
       LEFT JOIN orders o ON o.id = i.order_id AND o.user_id = i.user_id
       WHERE i.user_id = ? AND (
         LOWER(TRIM(i.invoice_number)) = LOWER(?)
         OR LOWER(TRIM(i.external_invoice_number)) = LOWER(?)
       )
       LIMIT 1`
    )
    .get(userId, normalized, normalized) as
    | {
        order_id: number | null;
        order_no: string | null;
        invoice_id: number;
        invoice_number: string;
        invoice_status: string;
        customer_name: string | null;
      }
    | undefined;

  if (byInvoice) {
    const expected = (await getInvoiceWithDetails(byInvoice.invoice_id, userId))?.total ?? null;
    return {
      order_id: byInvoice.order_id || 0,
      order_no: byInvoice.order_no || normalized,
      invoice_id: byInvoice.invoice_id,
      invoice_number: byInvoice.invoice_number,
      expected_amount: expected,
      customer_name: byInvoice.customer_name,
    };
  }

  return null;
}

async function findMediumCandidates(
  userId: number,
  grossAmount: number,
  paymentMethod: PaymentMethod,
  depositTime: string
): Promise<OrderMatch[]> {
  const dt = parseDateTime(depositTime);
  if (!dt) return [];

  const rows = await db
    .prepare(
      `SELECT o.id AS order_id, o.po_number AS order_no, o.reference_number, o.system_order_no,
              o.name AS customer_name, o.fields_json, o.created_at,
              i.id AS invoice_id, i.invoice_number, i.status AS invoice_status
       FROM orders o
       LEFT JOIN invoices i ON i.order_id = o.id AND i.user_id = o.user_id
         AND i.status != 'paid'
       WHERE o.user_id = ?
       ORDER BY o.id DESC, i.id DESC`
    )
    .all(userId) as {
    order_id: number;
    order_no: string | null;
    reference_number: string | null;
    system_order_no: string | null;
    customer_name: string | null;
    fields_json: string;
    created_at: string;
    invoice_id: number | null;
    invoice_number: string | null;
    invoice_status: string | null;
  }[];

  // Prefer one row per order (latest unpaid invoice already filtered in JOIN).
  const seenOrders = new Set<number>();
  const candidates: OrderMatch[] = [];

  for (const row of rows) {
    if (seenOrders.has(row.order_id)) continue;

    const created = parseDateTime(row.created_at);
    if (!created || !isWithinHours(dt, created, MEDIUM_MATCH_WINDOW_HOURS)) continue;

    let fields: Record<string, unknown> = {};
    try {
      fields = row.fields_json ? JSON.parse(row.fields_json) : {};
    } catch {
      fields = {};
    }

    const paymentAmount = Number(String(fields.payment_amount || '').replace(/[^0-9.\-]/g, ''));
    const paymentOption = [
      fields.payment_option,
      fields.payment_method_detail,
      fields.payment_bank,
      fields.payment2_bank,
      fields.payment3_bank,
    ]
      .map((v) => String(v || ''))
      .join(' ')
      .toLowerCase();

    if (!paymentMethodMatches(paymentMethod, paymentOption, { allowEmptyForBankMethods: true })) {
      continue;
    }

    const invoiceTotal = row.invoice_id
      ? (await getInvoiceWithDetails(row.invoice_id, userId))?.total ?? null
      : null;
    const compareAmount =
      invoiceTotal ?? (Number.isFinite(paymentAmount) && paymentAmount > 0 ? paymentAmount : null);
    if (compareAmount === null || !amountsClose(compareAmount, grossAmount)) continue;

    // Skip orders that already have a paid linked invoice only (no unpaid invoice and no amount).
    if (!row.invoice_id && !(Number.isFinite(paymentAmount) && paymentAmount > 0)) continue;

    seenOrders.add(row.order_id);
    candidates.push({
      order_id: row.order_id,
      order_no: row.reference_number || row.order_no || row.system_order_no || `#${row.order_id}`,
      invoice_id: row.invoice_id,
      invoice_number: row.invoice_number,
      expected_amount: compareAmount,
      customer_name: row.customer_name,
    });
  }

  return candidates;
}

async function suggestMatch(
  userId: number,
  recordId: number,
  opts: {
    status: 'Pending Approval' | 'Discrepancy';
    confidence: ReconConfidence | null;
    match?: OrderMatch | null;
    candidates?: OrderMatch[];
    orderNoHint?: string | null;
  }
): Promise<void> {
  const match = opts.match || null;
  const candidates = opts.candidates || [];
  const candidatesJson =
    candidates.length > 0
      ? JSON.stringify(
          candidates.map(
            (c): ReconCandidateSummary => ({
              order_id: c.order_id,
              order_no: c.order_no,
              invoice_id: c.invoice_id,
              invoice_number: c.invoice_number,
              amount: c.expected_amount,
              customer_name: c.customer_name ?? null,
            })
          )
        )
      : null;

  await db
    .prepare(
      `UPDATE reconciliation_records
       SET status = ?,
           confidence = ?,
           order_no = COALESCE(?, order_no),
           suggested_order_id = ?,
           suggested_invoice_id = ?,
           candidate_order_ids_json = ?,
           order_id = NULL,
           invoice_id = NULL,
           matched_at = NULL,
           approved_by = NULL,
           approved_at = NULL,
           updated_at = datetime('now')
       WHERE id = ? AND user_id = ?`
    )
    .run(
      opts.status,
      opts.confidence,
      match?.order_no || opts.orderNoHint || null,
      match?.order_id || null,
      match?.invoice_id || null,
      candidatesJson,
      recordId,
      userId
    );
}

async function getOrderDueTotal(
  userId: number,
  orderId: number,
  invoiceId: number | null
): Promise<number | null> {
  if (invoiceId) {
    const inv = await getInvoiceWithDetails(invoiceId, userId);
    if (inv?.total != null && inv.total > 0) return inv.total;
  }
  const row = (await db
    .prepare('SELECT total_amount FROM orders WHERE id = ? AND user_id = ?')
    .get(orderId, userId)) as { total_amount: number | null } | undefined;
  if (row?.total_amount != null && row.total_amount > 0) return Number(row.total_amount);
  return null;
}

async function commitApproval(
  userId: number,
  recordId: number,
  match: OrderMatch,
  input: ReconciliationInput,
  actorName: string,
  paymentSlot: PaymentSlot = 1
): Promise<void> {
  const depositTime = toIsoDateTime(input.deposit_time);
  const fee = input.transaction_fee ?? 0;
  const net = netAmount(input.gross_amount, fee);
  const approvedAt = nowIso();
  const slot = normalizePaymentSlot(paymentSlot);
  const slotKeys = paymentSlotFields(slot);

  await db
    .prepare(
      `UPDATE reconciliation_records
       SET order_no = ?, order_id = ?, invoice_id = ?, status = 'Matched',
           confidence = COALESCE(confidence, 'high'),
           suggested_order_id = ?, suggested_invoice_id = ?,
           candidate_order_ids_json = NULL,
           payment_slot = ?,
           matched_at = datetime('now'),
           approved_by = ?, approved_at = ?,
           updated_at = datetime('now')
       WHERE id = ? AND user_id = ?`
    )
    .run(
      match.order_no,
      match.order_id || null,
      match.invoice_id,
      match.order_id || null,
      match.invoice_id,
      slot,
      actorName,
      approvedAt,
      recordId,
      userId
    );

  if (match.order_id) {
    const existing = (await db
      .prepare('SELECT fields_json FROM orders WHERE id = ? AND user_id = ?')
      .get(match.order_id, userId)) as { fields_json: string } | undefined;
    if (existing) {
      let fields: Record<string, unknown> = {};
      try {
        fields = existing.fields_json ? JSON.parse(existing.fields_json) : {};
      } catch {
        fields = {};
      }
      const merged: Record<string, unknown> = {
        ...fields,
        [slotKeys.date]: depositTime.slice(0, 10),
        [slotKeys.amount]: String(input.gross_amount),
        [slotKeys.method]: input.payment_method,
        [slotKeys.verified]: true,
      };
      if (slot === 1) merged.payment1_amount = String(input.gross_amount);

      const paidTotal = computeOrderPaidTotal(merged as Record<string, string | boolean>);
      const dueTotal = await getOrderDueTotal(userId, match.order_id, match.invoice_id);
      merged.payment_status_label = derivePaymentStatusLabel(paidTotal, dueTotal);

      await db
        .prepare(`UPDATE orders SET fields_json = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`)
        .run(JSON.stringify(merged), match.order_id, userId);
      await logActivity(
        'order',
        match.order_id,
        userId,
        'activity',
        actorName,
        `Reconciliation #${recordId}: approved Matched (installment ${slot}) with ${input.payment_method} deposit ${input.gross_amount.toFixed(2)} HKD (net ${net.toFixed(2)})`
      );

      if (match.invoice_id && dueTotal != null && paidTotal >= dueTotal - 0.01) {
        await db
          .prepare(
            `UPDATE invoices SET status = 'paid', updated_at = datetime('now') WHERE id = ? AND user_id = ? AND status != 'paid'`
          )
          .run(match.invoice_id, userId);
        await logActivity(
          'invoice',
          match.invoice_id,
          userId,
          'activity',
          actorName,
          `Reconciliation #${recordId}: approved — marked invoice paid via ${input.payment_method} (${input.gross_amount.toFixed(2)} HKD)`
        );
      }
    }
  } else if (match.invoice_id) {
    await db
      .prepare(
        `UPDATE invoices SET status = 'paid', updated_at = datetime('now') WHERE id = ? AND user_id = ? AND status != 'paid'`
      )
      .run(match.invoice_id, userId);
    await logActivity(
      'invoice',
      match.invoice_id,
      userId,
      'activity',
      actorName,
      `Reconciliation #${recordId}: approved — marked invoice paid via ${input.payment_method} (${input.gross_amount.toFixed(2)} HKD)`
    );
  }
}

export async function insertReconciliationRecord(userId: number, input: ReconciliationInput): Promise<number> {
  const fee = input.transaction_fee ?? 0;
  const net = netAmount(input.gross_amount, fee);
  const depositTime = toIsoDateTime(input.deposit_time);

  const result = await db
    .prepare(
      `INSERT INTO reconciliation_records
       (user_id, order_no, deposit_time, gross_amount, payment_method, status, transaction_fee, net_amount,
        remarks, receipt_path, source, external_id, created_by)
       VALUES (?, ?, ?, ?, ?, 'Unmatched', ?, ?, ?, ?, ?, ?, ?)`
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
      input.receipt_path?.trim() || null,
      input.source,
      input.external_id || null,
      input.created_by?.trim() || null
    );

  return Number(result.lastInsertRowid);
}

export interface ManualPaymentInput {
  amount: number;
  invoice_no?: string | null;
  order_no?: string | null;
  remarks?: string | null;
  receipt_path?: string | null;
  payment_method?: PaymentMethod;
  deposit_time?: string | null;
  transaction_id?: string | null;
  created_by?: string | null;
}

/** Operator-entered deposit (not from Yedpay / bank CSV). Scores suggestions like imports. */
export async function createManualPayment(
  userId: number,
  input: ManualPaymentInput
): Promise<ReconciliationRecord> {
  const amount = round2(Number(input.amount));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Enter a valid amount (銀碼)');
  }

  const invoiceNo = input.invoice_no?.trim() || '';
  const orderNo = input.order_no?.trim() || '';
  const depositTime = toIsoDateTime(input.deposit_time?.trim() || nowIso());
  const paymentMethod: PaymentMethod = input.payment_method || 'FPS';
  const transactionId = input.transaction_id?.trim() || '';
  const externalId =
    transactionId || `manual:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;

  if (transactionId && (await recordExistsByExternalId(userId, externalId))) {
    throw new Error('Transaction ID already exists');
  }

  const reconInput: ReconciliationInput = {
    deposit_time: depositTime,
    gross_amount: amount,
    payment_method: paymentMethod,
    transaction_fee: 0,
    order_no: orderNo || invoiceNo || null,
    remarks: input.remarks?.trim() || null,
    receipt_path: input.receipt_path?.trim() || null,
    source: 'manual',
    external_id: externalId,
    created_by: input.created_by?.trim() || null,
  };

  const id = await insertReconciliationRecord(userId, reconInput);

  // Prefer explicit invoice no., then order no., then auto-score from remarks / amount.
  const preferKeys = [invoiceNo, orderNo].filter(Boolean);
  let suggested = false;
  for (const key of preferKeys) {
    const match = await findOrderByOrderNo(userId, key);
    if (!match) continue;
    if (match.expected_amount === null || amountsClose(amount, match.expected_amount)) {
      await suggestMatch(userId, id, {
        status: 'Pending Approval',
        confidence: 'high',
        match,
        orderNoHint: orderNo || match.order_no || key,
      });
    } else {
      await suggestMatch(userId, id, {
        status: 'Discrepancy',
        confidence: null,
        match,
        orderNoHint: orderNo || match.order_no || key,
      });
    }
    suggested = true;
    break;
  }

  if (!suggested) {
    await scoreAndSuggest(userId, id, reconInput);
  }

  const record = await getReconciliationRecord(userId, id);
  if (!record) throw new Error('Failed to create payment');
  return record;
}

async function recordExistsByExternalId(userId: number, externalId: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 FROM reconciliation_records WHERE user_id = ? AND external_id = ?')
    .get(userId, externalId);
  return Boolean(row);
}

/** Auto-score a deposit: suggest Pending Approval / Discrepancy — never marks invoice paid. */
export async function scoreAndSuggest(
  userId: number,
  recordId: number,
  input: ReconciliationInput
): Promise<ReconciliationStatus> {
  const orderNo =
    input.order_no?.trim() || (input.remarks ? extractOrderNoFromRemarks(input.remarks) : null);

  if (orderNo) {
    const match = await findOrderByOrderNo(userId, orderNo);
    if (match) {
      if (match.expected_amount === null || amountsClose(input.gross_amount, match.expected_amount)) {
        await suggestMatch(userId, recordId, {
          status: 'Pending Approval',
          confidence: 'high',
          match,
          orderNoHint: orderNo,
        });
        return 'Pending Approval';
      }
      await suggestMatch(userId, recordId, {
        status: 'Discrepancy',
        confidence: null,
        match,
        orderNoHint: orderNo,
      });
      return 'Discrepancy';
    }
  }

  const medium = await findMediumCandidates(
    userId,
    input.gross_amount,
    input.payment_method,
    input.deposit_time
  );
  const classified = classifyMediumCandidates(medium);

  if (classified.kind === 'unique' && classified.pick) {
    await suggestMatch(userId, recordId, {
      status: 'Pending Approval',
      confidence: 'medium',
      match: classified.pick,
    });
    return 'Pending Approval';
  }

  if (classified.kind === 'collision') {
    await suggestMatch(userId, recordId, {
      status: 'Discrepancy',
      confidence: null,
      candidates: medium,
    });
    return 'Discrepancy';
  }

  return 'Unmatched';
}

async function resolveMatchFromInvoice(
  userId: number,
  invoiceId: number,
  fallbackOrderNo: string | null
): Promise<OrderMatch | null> {
  const invoice = await getInvoiceWithDetails(invoiceId, userId);
  if (!invoice) return null;

  let orderNo = fallbackOrderNo;
  let orderId = invoice.order_id || 0;
  if (invoice.order_id) {
    const orderRow = (await db
      .prepare('SELECT id, po_number, reference_number, system_order_no FROM orders WHERE id = ? AND user_id = ?')
      .get(invoice.order_id, userId)) as
      | { id: number; po_number: string | null; reference_number: string | null; system_order_no: string | null }
      | undefined;
    if (orderRow) {
      orderId = orderRow.id;
      orderNo = orderRow.reference_number || orderRow.po_number || orderRow.system_order_no || orderNo;
    }
  }

  return {
    order_id: orderId,
    order_no: orderNo || invoice.invoice_number,
    invoice_id: invoice.id,
    invoice_number: invoice.invoice_number,
    expected_amount: invoice.total,
  };
}

export async function approveRecord(
  userId: number,
  recordId: number,
  actorName: string,
  invoiceIdOverride?: number | null
): Promise<ReconciliationRecord | null> {
  const record = await getReconciliationRecord(userId, recordId);
  if (!record) return null;
  if (record.status === 'Matched') return record;

  let match: OrderMatch | null = null;

  if (invoiceIdOverride) {
    match = await resolveMatchFromInvoice(userId, invoiceIdOverride, record.order_no);
  } else if (record.suggested_invoice_id) {
    match = await resolveMatchFromInvoice(userId, record.suggested_invoice_id, record.order_no);
  } else if (record.suggested_order_id) {
    const orderRow = (await db
      .prepare(
        `SELECT o.id, o.po_number, o.reference_number, o.system_order_no,
                i.id AS invoice_id, i.invoice_number
         FROM orders o
         LEFT JOIN invoices i ON i.order_id = o.id AND i.user_id = o.user_id AND i.status != 'paid'
         WHERE o.id = ? AND o.user_id = ?
         ORDER BY i.id DESC
         LIMIT 1`
      )
      .get(record.suggested_order_id, userId)) as
      | {
          id: number;
          po_number: string | null;
          reference_number: string | null;
          system_order_no: string | null;
          invoice_id: number | null;
          invoice_number: string | null;
        }
      | undefined;
    if (orderRow) {
      const expected = orderRow.invoice_id
        ? (await getInvoiceWithDetails(orderRow.invoice_id, userId))?.total ?? null
        : null;
      match = {
        order_id: orderRow.id,
        order_no:
          orderRow.reference_number ||
          orderRow.po_number ||
          orderRow.system_order_no ||
          record.order_no ||
          `#${orderRow.id}`,
        invoice_id: orderRow.invoice_id,
        invoice_number: orderRow.invoice_number,
        expected_amount: expected,
      };
    }
  }

  if (!match || (!match.invoice_id && !match.order_id)) {
    return null;
  }

  await commitApproval(
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
    actorName
  );

  return await getReconciliationRecord(userId, recordId);
}

export async function approveAllHighConfidence(
  userId: number,
  actorName: string
): Promise<{ approved: number }> {
  const rows = (await db
    .prepare(
      `SELECT id FROM reconciliation_records
       WHERE user_id = ? AND status = 'Pending Approval' AND confidence = 'high'
       ORDER BY id ASC`
    )
    .all(userId)) as { id: number }[];

  let approved = 0;
  for (const row of rows) {
    const result = await approveRecord(userId, row.id, actorName);
    if (result?.status === 'Matched') approved += 1;
  }
  return { approved };
}

export async function rejectRecord(
  userId: number,
  recordId: number
): Promise<ReconciliationRecord | null> {
  const record = await getReconciliationRecord(userId, recordId);
  if (!record) return null;
  if (record.status === 'Matched') return record;

  await db
    .prepare(
      `UPDATE reconciliation_records
       SET status = 'Unmatched',
           confidence = NULL,
           suggested_order_id = NULL,
           suggested_invoice_id = NULL,
           candidate_order_ids_json = NULL,
           order_id = NULL,
           invoice_id = NULL,
           matched_at = NULL,
           approved_by = NULL,
           approved_at = NULL,
           updated_at = datetime('now')
       WHERE id = ? AND user_id = ?`
    )
    .run(recordId, userId);

  return await getReconciliationRecord(userId, recordId);
}

/** Link a pending/unmatched deposit to a specific order installment (from Accounting Link Payment). */
export async function linkRecordToOrder(
  userId: number,
  recordId: number,
  orderId: number,
  actorName: string,
  paymentSlot: PaymentSlot = 1
): Promise<ReconciliationRecord | null> {
  const record = await getReconciliationRecord(userId, recordId);
  if (!record) return null;
  if (record.status === 'Matched') return record;

  const orderRow = (await db
    .prepare(
      `SELECT o.id, o.po_number, o.reference_number, o.system_order_no, o.name AS customer_name,
              i.id AS invoice_id, i.invoice_number
       FROM orders o
       LEFT JOIN invoices i ON i.order_id = o.id AND i.user_id = o.user_id AND i.status != 'paid'
       WHERE o.id = ? AND o.user_id = ?
       ORDER BY i.id DESC
       LIMIT 1`
    )
    .get(orderId, userId)) as
    | {
        id: number;
        po_number: string | null;
        reference_number: string | null;
        system_order_no: string | null;
        customer_name: string | null;
        invoice_id: number | null;
        invoice_number: string | null;
      }
    | undefined;

  if (!orderRow) return null;

  const invoiceId = record.suggested_invoice_id || orderRow.invoice_id;
  let expected: number | null = null;
  if (invoiceId) {
    expected = (await getInvoiceWithDetails(invoiceId, userId))?.total ?? null;
  }
  if (expected === null) {
    const fieldsRow = (await db
      .prepare('SELECT fields_json FROM orders WHERE id = ? AND user_id = ?')
      .get(orderId, userId)) as { fields_json: string } | undefined;
    try {
      const fields = fieldsRow?.fields_json ? JSON.parse(fieldsRow.fields_json) : {};
      const slotKeys = paymentSlotFields(normalizePaymentSlot(paymentSlot));
      const amt = Number(String(fields[slotKeys.amount] || '').replace(/[^0-9.\-]/g, ''));
      if (Number.isFinite(amt) && amt > 0) expected = amt;
    } catch {
      /* ignore */
    }
  }

  const match: OrderMatch = {
    order_id: orderRow.id,
    order_no:
      orderRow.reference_number ||
      orderRow.po_number ||
      orderRow.system_order_no ||
      record.order_no ||
      `#${orderRow.id}`,
    invoice_id: invoiceId,
    invoice_number: invoiceId
      ? (invoiceId === orderRow.invoice_id
          ? orderRow.invoice_number
          : (await getInvoiceWithDetails(invoiceId, userId))?.invoice_number ?? null)
      : null,
    expected_amount: expected,
    customer_name: orderRow.customer_name,
  };

  await commitApproval(
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
    actorName,
    normalizePaymentSlot(paymentSlot)
  );

  return await getReconciliationRecord(userId, recordId);
}

/** Reverse a Matched link: clear recon match, unset slot verification, revert invoice if underpaid. */
export async function unlinkRecord(
  userId: number,
  recordId: number,
  actorName: string
): Promise<ReconciliationRecord | null> {
  const record = await getReconciliationRecord(userId, recordId);
  if (!record) return null;
  if (record.status !== 'Matched') return record;

  const orderId = record.order_id;
  const invoiceId = record.invoice_id;
  const slot = normalizePaymentSlot(record.payment_slot ?? 1);
  const slotKeys = paymentSlotFields(slot);

  await db
    .prepare(
      `UPDATE reconciliation_records
       SET status = 'Unmatched',
           confidence = NULL,
           suggested_order_id = NULL,
           suggested_invoice_id = NULL,
           candidate_order_ids_json = NULL,
           order_id = NULL,
           invoice_id = NULL,
           payment_slot = NULL,
           order_no = COALESCE(order_no, ?),
           matched_at = NULL,
           approved_by = NULL,
           approved_at = NULL,
           updated_at = datetime('now')
       WHERE id = ? AND user_id = ?`
    )
    .run(record.order_no, recordId, userId);

  if (orderId) {
    const existing = (await db
      .prepare('SELECT fields_json FROM orders WHERE id = ? AND user_id = ?')
      .get(orderId, userId)) as { fields_json: string } | undefined;
    if (existing) {
      let fields: Record<string, unknown> = {};
      try {
        fields = existing.fields_json ? JSON.parse(existing.fields_json) : {};
      } catch {
        fields = {};
      }
      const merged: Record<string, unknown> = { ...fields, [slotKeys.verified]: false };
      const paidTotal = computeOrderPaidTotal(merged as Record<string, string | boolean>);
      const dueTotal = await getOrderDueTotal(userId, orderId, invoiceId);
      merged.payment_status_label = derivePaymentStatusLabel(paidTotal, dueTotal);

      await db
        .prepare(`UPDATE orders SET fields_json = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`)
        .run(JSON.stringify(merged), orderId, userId);
      await logActivity(
        'order',
        orderId,
        userId,
        'activity',
        actorName,
        `Reconciliation #${recordId}: unlinked — installment ${slot} verification cleared`
      );

      if (invoiceId && dueTotal != null && paidTotal < dueTotal - 0.01) {
        await db
          .prepare(
            `UPDATE invoices SET status = 'unpaid', updated_at = datetime('now')
             WHERE id = ? AND user_id = ? AND status = 'paid'`
          )
          .run(invoiceId, userId);
        await logActivity(
          'invoice',
          invoiceId,
          userId,
          'activity',
          actorName,
          `Reconciliation #${recordId}: unlinked — invoice set back to unpaid`
        );
      }
    }
  } else if (invoiceId) {
    await db
      .prepare(
        `UPDATE invoices SET status = 'unpaid', updated_at = datetime('now')
         WHERE id = ? AND user_id = ? AND status = 'paid'`
      )
      .run(invoiceId, userId);
    await logActivity(
      'invoice',
      invoiceId,
      userId,
      'activity',
      actorName,
      `Reconciliation #${recordId}: unlinked — invoice set back to unpaid`
    );
  }

  return await getReconciliationRecord(userId, recordId);
}

/** Manual link: operator picks unpaid invoice and commits approval in one step. */
export async function manualMatchRecord(
  userId: number,
  recordId: number,
  invoiceId: number,
  actorName: string
): Promise<ReconciliationRecord | null> {
  const record = await getReconciliationRecord(userId, recordId);
  if (!record) return null;
  if (record.status === 'Matched') return record;

  return approveRecord(userId, recordId, actorName, invoiceId);
}

export async function listMatchCandidates(
  userId: number,
  search?: string
): Promise<MatchCandidate[]> {
  const q = search?.trim().toLowerCase() || '';
  const rows = (await db
    .prepare(
      `SELECT o.id AS order_id, o.po_number AS order_no, o.reference_number, o.system_order_no,
              o.name AS customer_name, o.phone,
              i.id AS invoice_id, i.invoice_number, i.status AS invoice_status
       FROM invoices i
       LEFT JOIN orders o ON o.id = i.order_id AND o.user_id = i.user_id
       WHERE i.user_id = ? AND i.status != 'paid'
       ORDER BY i.issue_date DESC, i.id DESC`
    )
    .all(userId)) as {
    order_id: number | null;
    order_no: string | null;
    reference_number: string | null;
    system_order_no: string | null;
    customer_name: string | null;
    phone: string | null;
    invoice_id: number;
    invoice_number: string;
    invoice_status: string;
  }[];

  const totals = await invoiceTotalsByIds(
    userId,
    rows.map((r) => r.invoice_id)
  );

  const mapped = rows.map((r) => ({
    order_id: r.order_id || 0,
    order_no: r.reference_number || r.order_no || r.system_order_no || '',
    invoice_id: r.invoice_id,
    invoice_number: r.invoice_number,
    invoice_total: totals.get(r.invoice_id) ?? null,
    invoice_status: r.invoice_status,
    customer_name: r.customer_name,
    phone: r.phone,
  }));

  if (!q) return mapped;

  return mapped.filter((c) =>
    [c.order_no, c.invoice_number, c.customer_name, c.phone, c.invoice_total != null ? String(c.invoice_total) : '']
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(q)
  );
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

export async function syncYedpayForUser(
  userId: number,
  createdBy?: string | null
): Promise<{
  fetched: number;
  imported: number;
  suggested: number;
  skipped: number;
}> {
  if (!(await yedpayConfigured(userId))) {
    throw new Error('Yedpay is not configured — add credentials in Settings → API Integrations');
  }

  const sinceRow = (await db
    .prepare(
      `SELECT MAX(deposit_time) AS last FROM reconciliation_records WHERE user_id = ? AND source = 'yedpay'`
    )
    .get(userId)) as { last: string | null };

  const transactions = await fetchYedpayTransactions(userId, {
    since: sinceRow.last || undefined,
  });

  let imported = 0;
  let suggested = 0;
  let skipped = 0;

  await db.transaction(async () => {
    for (const txn of transactions) {
      if (txn.status !== 'paid') {
        skipped += 1;
        continue;
      }
      if (await recordExistsByExternalId(userId, txn.id)) {
        skipped += 1;
        continue;
      }

      const input: ReconciliationInput = {
        ...yedpayTxnToInput(txn),
        created_by: createdBy?.trim() || null,
      };
      const id = await insertReconciliationRecord(userId, input);
      imported += 1;
      const status = await scoreAndSuggest(userId, id, input);
      if (status === 'Pending Approval' || status === 'Discrepancy') suggested += 1;
    }
  });
  return { fetched: transactions.length, imported, suggested, skipped };
}

export async function importBankStatementRows(
  userId: number,
  paymentMethod: PaymentMethod,
  rows: ReconciliationInput[],
  createdBy?: string | null
): Promise<{ imported: number; suggested: number; skipped: number }> {
  let imported = 0;
  let suggested = 0;
  let skipped = 0;

  await db.transaction(async () => {
    for (const row of rows) {
      if (row.external_id && (await recordExistsByExternalId(userId, row.external_id))) {
        skipped += 1;
        continue;
      }
      const input: ReconciliationInput = {
        ...row,
        payment_method: paymentMethod,
        transaction_fee: 0,
        source: 'bank_upload',
        created_by: createdBy?.trim() || row.created_by || null,
      };
      const id = await insertReconciliationRecord(userId, input);
      imported += 1;
      const status = await scoreAndSuggest(userId, id, input);
      if (status === 'Pending Approval' || status === 'Discrepancy') suggested += 1;
    }
  });
  return { imported, suggested, skipped };
}
