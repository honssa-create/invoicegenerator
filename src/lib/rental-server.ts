import db from './db';
import { sendEmail } from './email';
import type { SendResult } from './email';
import {
  currentBillingPeriod,
  dueDateForPeriod,
  formatMoney,
  type PreviousYearRent,
  type RentRecord,
  type RentalStatus,
  type RentalUnit,
  type RentalUnitWithRecord,
} from './rentals';

interface UnitRow {
  id: number;
  user_id: number;
  unit_name: string;
  tenant_name: string;
  tenant_email: string | null;
  current_year_rent: number;
  previous_years_rent_json: string | null;
  lease_start_date: string | null;
  lease_end_date: string | null;
  due_date_day: number;
  auto_send_receipt_email: number;
  automation_enabled: number;
  created_at: string;
  updated_at: string;
}

interface RecordRow {
  id: number;
  user_id: number;
  unit_id: number;
  billing_period: string;
  actual_amount: number;
  status: RentalStatus;
  invoice_ref: string | null;
  receipt_ref: string | null;
  invoice_sent_at: string | null;
  receipt_sent_at: string | null;
  paid_at: string | null;
  custom_invoice_note: string | null;
  custom_receipt_note: string | null;
  created_at: string;
  updated_at: string;
}

function parsePrevious(raw: string | null): PreviousYearRent[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as PreviousYearRent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function hydrateUnit(row: UnitRow): RentalUnit {
  return {
    id: row.id,
    user_id: row.user_id,
    unitName: row.unit_name,
    tenantName: row.tenant_name,
    tenantEmail: row.tenant_email || '',
    currentYearRent: row.current_year_rent || 0,
    previousYearsRent: parsePrevious(row.previous_years_rent_json),
    leaseStartDate: row.lease_start_date || '',
    leaseEndDate: row.lease_end_date || '',
    dueDateDay: row.due_date_day || 1,
    autoSendReceiptEmail: Boolean(row.auto_send_receipt_email),
    automationEnabled: Boolean(row.automation_enabled),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function hydrateRecord(row: RecordRow): RentRecord {
  return {
    id: row.id,
    user_id: row.user_id,
    unitId: row.unit_id,
    billingPeriod: row.billing_period,
    actualAmount: row.actual_amount || 0,
    status: row.status,
    invoiceRef: row.invoice_ref,
    receiptRef: row.receipt_ref,
    invoiceSentAt: row.invoice_sent_at,
    receiptSentAt: row.receipt_sent_at,
    paidAt: row.paid_at,
    customInvoiceNote: row.custom_invoice_note,
    customReceiptNote: row.custom_receipt_note,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function createRentalUnit(
  userId: number,
  input: Partial<RentalUnit>
): RentalUnit {
  const res = db
    .prepare(
      `INSERT INTO rental_units
        (user_id, unit_name, tenant_name, tenant_email, current_year_rent,
         previous_years_rent_json, lease_start_date, lease_end_date, due_date_day,
         auto_send_receipt_email, automation_enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      userId,
      input.unitName?.trim() || 'New Unit',
      input.tenantName?.trim() || 'Tenant',
      input.tenantEmail?.trim() || null,
      Number(input.currentYearRent) || 0,
      JSON.stringify(input.previousYearsRent || []),
      input.leaseStartDate || null,
      input.leaseEndDate || null,
      Number(input.dueDateDay) || 1,
      input.autoSendReceiptEmail ? 1 : 0,
      input.automationEnabled === false ? 0 : 1
    );
  return getRentalUnit(Number(res.lastInsertRowid), userId)!;
}

export function getRentalUnit(id: number | string, userId: number): RentalUnit | null {
  const row = db
    .prepare('SELECT * FROM rental_units WHERE id = ? AND user_id = ?')
    .get(id, userId) as UnitRow | undefined;
  return row ? hydrateUnit(row) : null;
}

export function updateRentalUnit(
  id: number | string,
  userId: number,
  input: Partial<RentalUnit>
): RentalUnit | null {
  const existing = getRentalUnit(id, userId);
  if (!existing) return null;
  db.prepare(
    `UPDATE rental_units SET
      unit_name = ?, tenant_name = ?, tenant_email = ?, current_year_rent = ?,
      previous_years_rent_json = ?, lease_start_date = ?, lease_end_date = ?,
      due_date_day = ?, auto_send_receipt_email = ?, automation_enabled = ?,
      updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`
  ).run(
    input.unitName ?? existing.unitName,
    input.tenantName ?? existing.tenantName,
    (input.tenantEmail ?? existing.tenantEmail) || null,
    Number(input.currentYearRent ?? existing.currentYearRent) || 0,
    JSON.stringify(input.previousYearsRent ?? existing.previousYearsRent),
    (input.leaseStartDate ?? existing.leaseStartDate) || null,
    (input.leaseEndDate ?? existing.leaseEndDate) || null,
    Number(input.dueDateDay ?? existing.dueDateDay) || 1,
    (input.autoSendReceiptEmail ?? existing.autoSendReceiptEmail) ? 1 : 0,
    (input.automationEnabled ?? existing.automationEnabled) ? 1 : 0,
    id,
    userId
  );
  return getRentalUnit(id, userId);
}

export function ensureRentRecord(unit: RentalUnit, period = currentBillingPeriod()): RentRecord {
  const found = db
    .prepare('SELECT * FROM rental_records WHERE user_id = ? AND unit_id = ? AND billing_period = ?')
    .get(unit.user_id, unit.id, period) as RecordRow | undefined;
  if (found) return hydrateRecord(found);

  const res = db
    .prepare(
      `INSERT INTO rental_records (user_id, unit_id, billing_period, actual_amount, status)
       VALUES (?, ?, ?, ?, 'pending')`
    )
    .run(unit.user_id, unit.id, period, unit.currentYearRent);
  return getRentRecord(Number(res.lastInsertRowid), unit.user_id)!;
}

export function getRentRecord(id: number | string, userId: number): RentRecord | null {
  const row = db
    .prepare('SELECT * FROM rental_records WHERE id = ? AND user_id = ?')
    .get(id, userId) as RecordRow | undefined;
  return row ? hydrateRecord(row) : null;
}

function applyOverdueStatuses(userId: number, period: string) {
  const rows = db
    .prepare(
      `SELECT r.id, u.due_date_day
       FROM rental_records r
       JOIN rental_units u ON u.id = r.unit_id
       WHERE r.user_id = ? AND r.billing_period = ? AND r.status != 'paid'`
    )
    .all(userId, period) as { id: number; due_date_day: number }[];

  const today = new Date().toISOString().slice(0, 10);
  const mark = db.prepare("UPDATE rental_records SET status = 'overdue', updated_at = datetime('now') WHERE id = ?");
  for (const row of rows) {
    if (today > dueDateForPeriod(period, row.due_date_day)) mark.run(row.id);
  }
}

export function listRentalDashboard(userId: number, period = currentBillingPeriod()) {
  const unitRows = db
    .prepare('SELECT * FROM rental_units WHERE user_id = ? ORDER BY unit_name COLLATE NOCASE ASC')
    .all(userId) as UnitRow[];
  const units = unitRows.map(hydrateUnit);
  for (const unit of units) ensureRentRecord(unit, period);
  applyOverdueStatuses(userId, period);

  const withRecords: RentalUnitWithRecord[] = units.map((unit) => {
    const currentRecord = hydrateRecord(
      db
        .prepare('SELECT * FROM rental_records WHERE user_id = ? AND unit_id = ? AND billing_period = ?')
        .get(userId, unit.id, period) as RecordRow
    );
    const history = (db
      .prepare('SELECT * FROM rental_records WHERE user_id = ? AND unit_id = ? ORDER BY billing_period DESC LIMIT 18')
      .all(userId, unit.id) as RecordRow[]).map(hydrateRecord);
    return { ...unit, currentRecord, history };
  });

  const records = withRecords.map((u) => u.currentRecord);
  const totalRevenue = records.filter((r) => r.status === 'paid').reduce((s, r) => s + r.actualAmount, 0);
  const outstanding = records.filter((r) => r.status !== 'paid').reduce((s, r) => s + r.actualAmount, 0);
  const paidCount = records.filter((r) => r.status === 'paid').length;
  return { units: withRecords, metrics: { totalRevenue, outstanding, paidCount, totalUnits: units.length }, period };
}

function rentalInvoiceHtml(unit: RentalUnit, record: RentRecord, note?: string | null): string {
  return `<p>Dear ${unit.tenantName},</p>
    <p>Your rent invoice for <strong>${unit.unitName}</strong> (${record.billingPeriod}) is ready.</p>
    <p><strong>Amount due:</strong> ${formatMoney(record.actualAmount)}</p>
    <p><strong>Due date:</strong> ${dueDateForPeriod(record.billingPeriod, unit.dueDateDay)}</p>
    ${note ? `<p>${note}</p>` : ''}
    <p>Thank you.</p>`;
}

function rentalReceiptHtml(unit: RentalUnit, record: RentRecord, note?: string | null): string {
  return `<p>Dear ${unit.tenantName},</p>
    <p>Payment received for <strong>${unit.unitName}</strong> (${record.billingPeriod}).</p>
    <p><strong>Receipt amount:</strong> ${formatMoney(record.actualAmount)}</p>
    ${note ? `<p>${note}</p>` : ''}
    <p>Thank you.</p>`;
}

export async function sendRentInvoice(
  recordId: number | string,
  userId: number,
  input: { actualAmount?: number; note?: string | null }
) {
  const record = getRentRecord(recordId, userId);
  if (!record) throw new Error('Rent record not found');
  const unit = getRentalUnit(record.unitId, userId);
  if (!unit) throw new Error('Rental unit not found');
  const amount = Number(input.actualAmount ?? record.actualAmount) || 0;
  const invoiceRef = `/rentals/records/${record.id}/invoice`;

  db.prepare(
    `UPDATE rental_records SET actual_amount = ?, status = CASE WHEN status = 'paid' THEN status ELSE 'pending' END,
      invoice_ref = ?, custom_invoice_note = ?, invoice_sent_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`
  ).run(amount, invoiceRef, input.note?.trim() || null, record.id, userId);

  let email: SendResult = { sent: false, provider: 'log' };
  if (unit.tenantEmail) {
    email = await sendEmail(
      unit.tenantEmail,
      `Rent invoice ${unit.unitName} ${record.billingPeriod}`,
      rentalInvoiceHtml(unit, { ...record, actualAmount: amount, invoiceRef }, input.note)
    );
  }
  return { record: getRentRecord(record.id, userId)!, email };
}

export async function markRentPaid(
  recordId: number | string,
  userId: number,
  input: { autoSendReceiptEmail?: boolean; note?: string | null }
) {
  const record = getRentRecord(recordId, userId);
  if (!record) throw new Error('Rent record not found');
  const unit = getRentalUnit(record.unitId, userId);
  if (!unit) throw new Error('Rental unit not found');
  const receiptRef = `/rentals/records/${record.id}/receipt`;
  const shouldSend = input.autoSendReceiptEmail ?? unit.autoSendReceiptEmail;

  db.prepare(
    `UPDATE rental_records SET status = 'paid', receipt_ref = ?, paid_at = datetime('now'),
      custom_receipt_note = ?, receipt_sent_at = CASE WHEN ? THEN datetime('now') ELSE receipt_sent_at END,
      updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`
  ).run(receiptRef, input.note?.trim() || null, shouldSend ? 1 : 0, record.id, userId);

  if (input.autoSendReceiptEmail !== undefined) {
    updateRentalUnit(unit.id, userId, { autoSendReceiptEmail: input.autoSendReceiptEmail });
  }

  let email: SendResult = { sent: false, provider: 'log' };
  if (shouldSend && unit.tenantEmail) {
    email = await sendEmail(
      unit.tenantEmail,
      `Rent receipt ${unit.unitName} ${record.billingPeriod}`,
      rentalReceiptHtml(unit, { ...record, receiptRef }, input.note)
    );
  }
  return { record: getRentRecord(record.id, userId)!, email };
}

export async function runRentalInvoiceDispatch(userId: number | null, period = currentBillingPeriod()) {
  const rows = db
    .prepare(`SELECT * FROM rental_units WHERE automation_enabled = 1 ${userId === null ? '' : 'AND user_id = ?'}`)
    .all(...(userId === null ? [] : [userId])) as UnitRow[];
  const results = [];
  for (const unitRow of rows) {
    const unit = hydrateUnit(unitRow);
    const record = ensureRentRecord(unit, period);
    if (!record.invoiceSentAt) {
      results.push({ unit: unit.unitName, ...(await sendRentInvoice(record.id, unit.user_id, { actualAmount: record.actualAmount })) });
    }
  }
  return { period, processed: results.length, results };
}

export function getRentDocument(id: number | string, userId: number) {
  const record = getRentRecord(id, userId);
  if (!record) return null;
  const unit = getRentalUnit(record.unitId, userId);
  if (!unit) return null;
  return { unit, record, dueDate: dueDateForPeriod(record.billingPeriod, unit.dueDateDay) };
}
