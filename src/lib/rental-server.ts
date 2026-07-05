import db from './db';
import { sendEmail } from './email';
import type { SendResult } from './email';
import { saveReceipt } from './receipt';
import {
  computeTotal,
  currentBillingPeriod,
  dueDateForPeriod,
  formatMoney,
  type PreviousYearRent,
  type RentRecord,
  type RentalActivityLog,
  type RentalPaymentReceipt,
  type RentalStatus,
  type RentalUnit,
  type RentalUnitWithRecord,
} from './rentals';

// ---------------------------------------------------------------------------
// Row hydrators
// ---------------------------------------------------------------------------

interface UnitRow {
  id: number; user_id: number; unit_name: string; tenant_name: string;
  tenant_phone: string | null; tenant_email: string | null;
  current_year_rent: number; previous_years_rent_json: string | null;
  lease_start_date: string | null; lease_end_date: string | null;
  due_date_day: number; auto_send_receipt_email: number;
  automation_enabled: number; created_at: string; updated_at: string;
}

interface RecordRow {
  id: number; user_id: number; unit_id: number; billing_period: string;
  base_rent: number; water_fee: number; electricity_fee: number;
  actual_amount: number; status: RentalStatus;
  paid_date: string | null; invoice_ref: string | null; receipt_ref: string | null;
  receipt_image_path: string | null;
  invoice_sent_at: string | null; receipt_sent_at: string | null;
  paid_at: string | null; custom_invoice_note: string | null;
  custom_receipt_note: string | null; created_at: string; updated_at: string;
}

interface ReceiptRow {
  id: number; user_id: number; rent_record_id: number; image_path: string;
  extracted_method: string | null; extracted_transfer_date: string | null;
  extracted_receiving_account: string | null; extracted_amount: number | null;
  extraction_source: string | null; created_at: string;
}

interface ActivityRow {
  id: number; user_id: number; unit_id: number; rent_record_id: number | null;
  action: string; note: string | null; created_at: string;
}

function parsePrevious(raw: string | null): PreviousYearRent[] {
  if (!raw) return [];
  try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; }
}

function hydrateUnit(row: UnitRow): RentalUnit {
  return {
    id: row.id, user_id: row.user_id, unitName: row.unit_name, tenantName: row.tenant_name,
    tenantPhone: row.tenant_phone || '', tenantEmail: row.tenant_email || '',
    currentYearRent: row.current_year_rent || 0,
    previousYearsRent: parsePrevious(row.previous_years_rent_json),
    leaseStartDate: row.lease_start_date || '', leaseEndDate: row.lease_end_date || '',
    dueDateDay: row.due_date_day || 1, autoSendReceiptEmail: Boolean(row.auto_send_receipt_email),
    automationEnabled: Boolean(row.automation_enabled),
    created_at: row.created_at, updated_at: row.updated_at,
  };
}

function hydrateRecord(row: RecordRow): RentRecord {
  const base = row.base_rent || 0;
  const water = row.water_fee || 0;
  const elec = row.electricity_fee || 0;
  return {
    id: row.id, user_id: row.user_id, unitId: row.unit_id,
    billingPeriod: row.billing_period,
    baseRent: base, waterFee: water, electricityFee: elec,
    actualAmount: row.actual_amount || computeTotal(base, water, elec),
    status: row.status, paidDate: row.paid_date || null,
    invoiceRef: row.invoice_ref, receiptRef: row.receipt_ref,
    receiptImagePath: row.receipt_image_path || null,
    invoiceSentAt: row.invoice_sent_at, receiptSentAt: row.receipt_sent_at,
    paidAt: row.paid_at, customInvoiceNote: row.custom_invoice_note,
    customReceiptNote: row.custom_receipt_note,
    created_at: row.created_at, updated_at: row.updated_at,
  };
}

function hydrateReceipt(row: ReceiptRow): RentalPaymentReceipt {
  return {
    id: row.id, user_id: row.user_id, rentRecordId: row.rent_record_id,
    imagePath: row.image_path, extractedMethod: row.extracted_method,
    extractedTransferDate: row.extracted_transfer_date,
    extractedReceivingAccount: row.extracted_receiving_account,
    extractedAmount: row.extracted_amount, extractionSource: row.extraction_source,
    created_at: row.created_at,
  };
}

function hydrateActivity(row: ActivityRow): RentalActivityLog {
  return {
    id: row.id, user_id: row.user_id, unitId: row.unit_id,
    rentRecordId: row.rent_record_id, action: row.action, note: row.note,
    created_at: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// Activity logging
// ---------------------------------------------------------------------------

export function logRentalActivity(
  userId: number, unitId: number, action: string,
  note?: string | null, rentRecordId?: number | null
) {
  db.prepare(
    'INSERT INTO rental_activity_logs (user_id, unit_id, rent_record_id, action, note) VALUES (?, ?, ?, ?, ?)'
  ).run(userId, unitId, rentRecordId ?? null, action, note?.trim() || null);
}

export function getRentalActivities(unitId: number, userId: number): RentalActivityLog[] {
  return (db
    .prepare('SELECT * FROM rental_activity_logs WHERE unit_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 50')
    .all(unitId, userId) as ActivityRow[]).map(hydrateActivity);
}

// ---------------------------------------------------------------------------
// Unit CRUD
// ---------------------------------------------------------------------------

export function createRentalUnit(userId: number, input: Partial<RentalUnit>): RentalUnit {
  const res = db.prepare(
    `INSERT INTO rental_units
      (user_id, unit_name, tenant_name, tenant_phone, tenant_email, current_year_rent,
       previous_years_rent_json, lease_start_date, lease_end_date, due_date_day,
       auto_send_receipt_email, automation_enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    userId, input.unitName?.trim() || 'New Unit', input.tenantName?.trim() || 'Tenant',
    input.tenantPhone?.trim() || null, input.tenantEmail?.trim() || null,
    Number(input.currentYearRent) || 0, JSON.stringify(input.previousYearsRent || []),
    input.leaseStartDate || null, input.leaseEndDate || null,
    Number(input.dueDateDay) || 1, input.autoSendReceiptEmail ? 1 : 0,
    input.automationEnabled === false ? 0 : 1
  );
  const unit = getRentalUnit(Number(res.lastInsertRowid), userId)!;
  logRentalActivity(userId, unit.id, 'Unit created');
  return unit;
}

export function getRentalUnit(id: number | string, userId: number): RentalUnit | null {
  const row = db.prepare('SELECT * FROM rental_units WHERE id = ? AND user_id = ?').get(id, userId) as UnitRow | undefined;
  return row ? hydrateUnit(row) : null;
}

export function updateRentalUnit(id: number | string, userId: number, input: Partial<RentalUnit>): RentalUnit | null {
  const existing = getRentalUnit(id, userId);
  if (!existing) return null;
  db.prepare(
    `UPDATE rental_units SET
      unit_name = ?, tenant_name = ?, tenant_phone = ?, tenant_email = ?, current_year_rent = ?,
      previous_years_rent_json = ?, lease_start_date = ?, lease_end_date = ?,
      due_date_day = ?, auto_send_receipt_email = ?, automation_enabled = ?,
      updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`
  ).run(
    input.unitName ?? existing.unitName, input.tenantName ?? existing.tenantName,
    (input.tenantPhone ?? existing.tenantPhone) || null,
    (input.tenantEmail ?? existing.tenantEmail) || null,
    Number(input.currentYearRent ?? existing.currentYearRent) || 0,
    JSON.stringify(input.previousYearsRent ?? existing.previousYearsRent),
    (input.leaseStartDate ?? existing.leaseStartDate) || null,
    (input.leaseEndDate ?? existing.leaseEndDate) || null,
    Number(input.dueDateDay ?? existing.dueDateDay) || 1,
    (input.autoSendReceiptEmail ?? existing.autoSendReceiptEmail) ? 1 : 0,
    (input.automationEnabled ?? existing.automationEnabled) ? 1 : 0,
    id, userId
  );
  return getRentalUnit(id, userId);
}

// ---------------------------------------------------------------------------
// Record helpers
// ---------------------------------------------------------------------------

export function ensureRentRecord(unit: RentalUnit, period = currentBillingPeriod()): RentRecord {
  const found = db.prepare(
    'SELECT * FROM rental_records WHERE user_id = ? AND unit_id = ? AND billing_period = ?'
  ).get(unit.user_id, unit.id, period) as RecordRow | undefined;
  if (found) return hydrateRecord(found);

  const base = unit.currentYearRent;
  const res = db.prepare(
    `INSERT INTO rental_records (user_id, unit_id, billing_period, base_rent, water_fee, electricity_fee, actual_amount, status)
     VALUES (?, ?, ?, ?, 0, 0, ?, 'pending')`
  ).run(unit.user_id, unit.id, period, base, base);
  return getRentRecord(Number(res.lastInsertRowid), unit.user_id)!;
}

export function getRentRecord(id: number | string, userId: number): RentRecord | null {
  const row = db.prepare('SELECT * FROM rental_records WHERE id = ? AND user_id = ?').get(id, userId) as RecordRow | undefined;
  return row ? hydrateRecord(row) : null;
}

export function updateRentRecordUtilities(
  id: number | string, userId: number,
  input: { waterFee?: number; electricityFee?: number; customInvoiceNote?: string | null }
): RentRecord | null {
  const existing = getRentRecord(id, userId);
  if (!existing) return null;
  const water = Number(input.waterFee ?? existing.waterFee) || 0;
  const elec = Number(input.electricityFee ?? existing.electricityFee) || 0;
  const total = computeTotal(existing.baseRent, water, elec);
  db.prepare(
    `UPDATE rental_records SET water_fee = ?, electricity_fee = ?, actual_amount = ?,
      custom_invoice_note = ?, updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`
  ).run(water, elec, total, input.customInvoiceNote ?? existing.customInvoiceNote, id, userId);
  return getRentRecord(id, userId);
}

function applyOverdueStatuses(userId: number, period: string) {
  const rows = db.prepare(
    `SELECT r.id, u.due_date_day FROM rental_records r
     JOIN rental_units u ON u.id = r.unit_id
     WHERE r.user_id = ? AND r.billing_period = ? AND r.status != 'paid'`
  ).all(userId, period) as { id: number; due_date_day: number }[];
  const today = new Date().toISOString().slice(0, 10);
  const mark = db.prepare("UPDATE rental_records SET status = 'overdue', updated_at = datetime('now') WHERE id = ?");
  for (const row of rows) {
    if (today > dueDateForPeriod(period, row.due_date_day)) mark.run(row.id);
  }
}

// ---------------------------------------------------------------------------
// Dashboard / Detail
// ---------------------------------------------------------------------------

export function listRentalDashboard(userId: number, period = currentBillingPeriod()) {
  const unitRows = db.prepare(
    'SELECT * FROM rental_units WHERE user_id = ? ORDER BY unit_name COLLATE NOCASE ASC'
  ).all(userId) as UnitRow[];
  const units = unitRows.map(hydrateUnit);
  for (const unit of units) ensureRentRecord(unit, period);
  applyOverdueStatuses(userId, period);

  const withRecords: RentalUnitWithRecord[] = units.map((unit) => {
    const currentRecord = hydrateRecord(
      db.prepare('SELECT * FROM rental_records WHERE user_id = ? AND unit_id = ? AND billing_period = ?')
        .get(userId, unit.id, period) as RecordRow
    );
    const history = (db.prepare(
      'SELECT * FROM rental_records WHERE user_id = ? AND unit_id = ? ORDER BY billing_period DESC LIMIT 24'
    ).all(userId, unit.id) as RecordRow[]).map(hydrateRecord);
    return { ...unit, currentRecord, history };
  });

  const records = withRecords.map((u) => u.currentRecord);
  const totalRevenue = records.filter((r) => r.status === 'paid').reduce((s, r) => s + r.actualAmount, 0);
  const outstanding = records.filter((r) => r.status !== 'paid').reduce((s, r) => s + r.actualAmount, 0);
  const paidCount = records.filter((r) => r.status === 'paid').length;
  return { units: withRecords, metrics: { totalRevenue, outstanding, paidCount, totalUnits: units.length }, period };
}

export function getRentalUnitDetail(unitId: number | string, userId: number, period = currentBillingPeriod()) {
  const unit = getRentalUnit(unitId, userId);
  if (!unit) return null;
  ensureRentRecord(unit, period);
  applyOverdueStatuses(userId, period);
  const currentRecord = getRentRecord(
    (db.prepare('SELECT id FROM rental_records WHERE user_id = ? AND unit_id = ? AND billing_period = ?')
      .get(userId, unit.id, period) as { id: number })?.id,
    userId
  );
  const history = (db.prepare(
    'SELECT * FROM rental_records WHERE user_id = ? AND unit_id = ? ORDER BY billing_period DESC'
  ).all(userId, unit.id) as RecordRow[]).map(hydrateRecord);
  const activities = getRentalActivities(unit.id, userId);
  const latestReceipt = currentRecord
    ? (db.prepare('SELECT * FROM rental_payment_receipts WHERE rent_record_id = ? ORDER BY created_at DESC LIMIT 1')
        .get(currentRecord.id) as ReceiptRow | undefined)
    : undefined;
  return {
    unit, currentRecord, history, activities,
    latestReceipt: latestReceipt ? hydrateReceipt(latestReceipt) : null,
  };
}

// ---------------------------------------------------------------------------
// Email HTML builders
// ---------------------------------------------------------------------------

function invoiceHtml(unit: RentalUnit, record: RentRecord, note?: string | null): string {
  const lineItems = [
    `<tr><td>基本租金 Base Rent</td><td align="right"><strong>${formatMoney(record.baseRent)}</strong></td></tr>`,
    record.waterFee > 0 ? `<tr><td>水費 Water</td><td align="right">${formatMoney(record.waterFee)}</td></tr>` : '',
    record.electricityFee > 0 ? `<tr><td>電費 Electricity</td><td align="right">${formatMoney(record.electricityFee)}</td></tr>` : '',
    `<tr style="border-top:2px solid #000"><td><strong>Total</strong></td><td align="right"><strong>${formatMoney(record.actualAmount)}</strong></td></tr>`,
  ].join('');
  return `<p>Dear ${unit.tenantName},</p>
    <p>Rent invoice for <strong>${unit.unitName}</strong> — ${record.billingPeriod}.</p>
    <table style="width:100%;border-collapse:collapse">${lineItems}</table>
    <p>Due: ${dueDateForPeriod(record.billingPeriod, unit.dueDateDay)}</p>
    ${note ? `<p>${note}</p>` : ''}
    <p>Thank you.</p>`;
}

function receiptHtml(unit: RentalUnit, record: RentRecord, note?: string | null): string {
  return `<p>Dear ${unit.tenantName},</p>
    <p>Payment received for <strong>${unit.unitName}</strong> — ${record.billingPeriod}.</p>
    <p><strong>Amount: ${formatMoney(record.actualAmount)}</strong> · Paid: ${record.paidDate || record.paidAt?.slice(0, 10) || 'today'}</p>
    ${note ? `<p>${note}</p>` : ''}
    <p>Thank you.</p>`;
}

// ---------------------------------------------------------------------------
// Invoice dispatch
// ---------------------------------------------------------------------------

export async function sendRentInvoice(
  recordId: number | string, userId: number,
  input: { waterFee?: number; electricityFee?: number; note?: string | null }
) {
  const record = getRentRecord(recordId, userId);
  if (!record) throw new Error('Rent record not found');
  const unit = getRentalUnit(record.unitId, userId);
  if (!unit) throw new Error('Rental unit not found');

  const water = Number(input.waterFee ?? record.waterFee) || 0;
  const elec = Number(input.electricityFee ?? record.electricityFee) || 0;
  const total = computeTotal(record.baseRent, water, elec);
  const invoiceRef = `/rentals/records/${record.id}/invoice`;

  db.prepare(
    `UPDATE rental_records SET water_fee = ?, electricity_fee = ?, actual_amount = ?,
      invoice_ref = ?, custom_invoice_note = ?, invoice_sent_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`
  ).run(water, elec, total, invoiceRef, input.note?.trim() || null, record.id, userId);

  const fresh = getRentRecord(record.id, userId)!;
  let email: SendResult = { sent: false, provider: 'log' };
  if (unit.tenantEmail) {
    email = await sendEmail(
      unit.tenantEmail,
      `租金單 ${unit.unitName} ${record.billingPeriod}`,
      invoiceHtml(unit, fresh, input.note)
    );
  }
  logRentalActivity(userId, unit.id, 'Invoice Sent', `Period ${record.billingPeriod} · Total ${formatMoney(total)}`, record.id);
  return { record: fresh, email };
}

// ---------------------------------------------------------------------------
// AI receipt extraction (Gemini → OCR fallback)
// ---------------------------------------------------------------------------

const RECEIPT_PROMPT = `You are reading a Hong Kong bank transfer slip / payment receipt.
Return ONLY JSON: {"amount":number|null,"method":string|null,"transfer_date":"YYYY-MM-DD"|null,"receiving_account":string|null}
- amount: numeric payment amount. method: FPS/PayMe/Bank Transfer/etc. transfer_date: ISO date. receiving_account: receiving bank account or phone.`;

async function geminiExtractRental(base64: string, mimeType: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: RECEIPT_PROMPT }, { inline_data: { mime_type: mimeType, data: base64 } }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0 },
        }),
      }
    );
    if (!res.ok) return null;
    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;
    const p = JSON.parse(text);
    return {
      amount: typeof p.amount === 'number' ? p.amount : p.amount ? Number(String(p.amount).replace(/[^0-9.]/g, '')) : null,
      method: p.method ? String(p.method) : null,
      transfer_date: p.transfer_date ? String(p.transfer_date) : null,
      receiving_account: p.receiving_account ? String(p.receiving_account) : null,
    };
  } catch { return null; }
}

function ocrFallbackExtract(text: string) {
  let transfer_date: string | null = null;
  const dm = text.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (dm) transfer_date = `${dm[1]}-${String(+dm[2]).padStart(2, '0')}-${String(+dm[3]).padStart(2, '0')}`;

  let amount: number | null = null;
  const ac = text.match(/(?:HK\$|\$|amount|金額|銀碼)\s*([0-9][0-9,]*\.?\d{0,2})/i);
  if (ac) amount = Number(ac[1].replace(/,/g, ''));
  if (!amount) {
    const nums = (text.match(/\d[\d,]*\.\d{2}/g) || []).map((s) => Number(s.replace(/,/g, '')));
    if (nums.length) amount = Math.max(...nums);
  }

  const method = /轉數快|FPS/i.test(text) ? 'FPS 轉數快' : /PayMe/i.test(text) ? 'PayMe' : /transfer|轉賬|轉帳/i.test(text) ? 'Bank Transfer' : null;
  const acct = text.match(/(?:account|戶口|帳號)[^\d]*(\d{6,})/i)?.[1] || null;

  return { amount, method, transfer_date, receiving_account: acct };
}

export async function extractRentalReceipt(
  recordId: number | string, userId: number,
  buffer: Buffer, mimeType: string
): Promise<{ receipt: RentalPaymentReceipt; matched: boolean; extracted: ReturnType<typeof ocrFallbackExtract> }> {
  const record = getRentRecord(recordId, userId);
  if (!record) throw new Error('Rent record not found');
  const unit = getRentalUnit(record.unitId, userId);
  if (!unit) throw new Error('Rental unit not found');

  const imagePath = saveReceipt(buffer, mimeType);

  const aiResult = await geminiExtractRental(buffer.toString('base64'), mimeType);
  let extracted: ReturnType<typeof ocrFallbackExtract>;
  let source = 'ocr';

  if (aiResult) {
    extracted = { amount: aiResult.amount, method: aiResult.method, transfer_date: aiResult.transfer_date, receiving_account: aiResult.receiving_account };
    source = 'ai';
  } else {
    const { ocrImageText } = await import('./receipt');
    let text = '';
    try { text = await ocrImageText(buffer); } catch { text = ''; }
    extracted = ocrFallbackExtract(text);
  }

  db.prepare(
    `UPDATE rental_records SET receipt_image_path = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`
  ).run(imagePath, record.id, userId);

  const res = db.prepare(
    `INSERT INTO rental_payment_receipts (user_id, rent_record_id, image_path, extracted_method, extracted_transfer_date, extracted_receiving_account, extracted_amount, extraction_source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(userId, record.id, imagePath, extracted.method, extracted.transfer_date, extracted.receiving_account, extracted.amount, source);

  const matched = extracted.amount !== null && Math.abs(extracted.amount - record.actualAmount) < 0.01;
  logRentalActivity(userId, unit.id, 'Payment Receipt Uploaded', `Source: ${source}, Amount: ${extracted.amount ?? '?'}, Matched: ${matched}`, record.id);

  return {
    receipt: hydrateReceipt(
      db.prepare('SELECT * FROM rental_payment_receipts WHERE id = ?').get(Number(res.lastInsertRowid)) as ReceiptRow
    ),
    matched,
    extracted,
  };
}

// ---------------------------------------------------------------------------
// Mark paid + auto receipt
// ---------------------------------------------------------------------------

export async function markRentPaid(
  recordId: number | string, userId: number,
  input: { autoSendReceiptEmail?: boolean; note?: string | null; paidDate?: string | null }
) {
  const record = getRentRecord(recordId, userId);
  if (!record) throw new Error('Rent record not found');
  const unit = getRentalUnit(record.unitId, userId);
  if (!unit) throw new Error('Rental unit not found');
  const receiptRef = `/rentals/records/${record.id}/receipt`;
  const shouldSend = input.autoSendReceiptEmail ?? unit.autoSendReceiptEmail;
  const paidDate = input.paidDate || new Date().toISOString().slice(0, 10);

  db.prepare(
    `UPDATE rental_records SET status = 'paid', receipt_ref = ?, paid_date = ?, paid_at = datetime('now'),
      custom_receipt_note = ?, receipt_sent_at = CASE WHEN ? THEN datetime('now') ELSE receipt_sent_at END,
      updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`
  ).run(receiptRef, paidDate, input.note?.trim() || null, shouldSend ? 1 : 0, record.id, userId);

  if (input.autoSendReceiptEmail !== undefined) {
    updateRentalUnit(unit.id, userId, { autoSendReceiptEmail: input.autoSendReceiptEmail });
  }

  const fresh = getRentRecord(record.id, userId)!;
  let email: SendResult = { sent: false, provider: 'log' };
  if (shouldSend && unit.tenantEmail) {
    email = await sendEmail(
      unit.tenantEmail,
      `租金收據 ${unit.unitName} ${record.billingPeriod}`,
      receiptHtml(unit, fresh, input.note)
    );
  }
  logRentalActivity(userId, unit.id, 'Payment Marked Paid', `Period ${record.billingPeriod} · Paid ${paidDate} · Email: ${shouldSend}`, record.id);
  return { record: fresh, email };
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

export async function runRentalInvoiceDispatch(userId: number | null, period = currentBillingPeriod()) {
  const rows = db.prepare(
    `SELECT * FROM rental_units WHERE automation_enabled = 1 ${userId === null ? '' : 'AND user_id = ?'}`
  ).all(...(userId === null ? [] : [userId])) as UnitRow[];
  const results = [];
  for (const unitRow of rows) {
    const unit = hydrateUnit(unitRow);
    const record = ensureRentRecord(unit, period);
    if (!record.invoiceSentAt) {
      results.push({ unit: unit.unitName, ...(await sendRentInvoice(record.id, unit.user_id, {})) });
    }
  }
  return { period, processed: results.length, results };
}

// ---------------------------------------------------------------------------
// Print document helper
// ---------------------------------------------------------------------------

export function getRentDocument(id: number | string, userId: number) {
  const record = getRentRecord(id, userId);
  if (!record) return null;
  const unit = getRentalUnit(record.unitId, userId);
  if (!unit) return null;
  return { unit, record, dueDate: dueDateForPeriod(record.billingPeriod, unit.dueDateDay) };
}
