import db from './db';
import { saveReceipt } from './receipt';
import { ensureUnitTenantLink, findOrCreateTenant } from './rental-ledger-server';
import {
  billingPeriodAfterLeaseEnd,
  computeLeaseDisplayStatus,
  currentBillingPeriod,
  displayRentalStatus,
  formatMoney,
  isLeaseBillingActive,
  normalizeStoredDate,
  outstandingBalance,
  pastLeaseStatusLabel,
  isVacantUnitName,
  VACANT_TENANT_NAME,
  type PreviousLeaseRecord,
  type LeaseDocumentType,
  type LeaseStoredStatus,
  type RentalDashboardAlert,
  type RentalLease,
  type RentalLeaseDocument,
  type RentalUnit,
} from './rentals';

interface LeaseRow {
  id: number; user_id: number; unit_id: number; tenant_id: number | null;
  tenant_name: string; tenant_phone: string | null; tenant_email: string | null;
  lease_start_date: string; lease_end_date: string; actual_end_date: string | null;
  base_rent: number; due_date_day: number; deposit_amount: number;
  deposit_refund: number | null; deposit_deductions: number;
  status: string; end_reason: string | null; end_notes: string | null;
  auto_send_receipt_email: number; automation_enabled: number; is_current: number;
  created_at: string; updated_at: string;
}

interface DocRow {
  id: number; user_id: number; lease_id: number; doc_type: string;
  file_path: string; label: string | null; created_at: string;
}

function hydrateLease(row: LeaseRow): RentalLease {
  return {
    id: row.id, user_id: row.user_id, unitId: row.unit_id, tenantId: row.tenant_id,
    tenantName: row.tenant_name, tenantPhone: row.tenant_phone || '', tenantEmail: row.tenant_email || '',
    leaseStartDate: row.lease_start_date, leaseEndDate: row.lease_end_date,
    actualEndDate: row.actual_end_date, baseRent: row.base_rent || 0,
    dueDateDay: row.due_date_day || 1, depositAmount: row.deposit_amount || 0,
    depositRefund: row.deposit_refund, depositDeductions: row.deposit_deductions || 0,
    status: row.status as LeaseStoredStatus,
    endReason: row.end_reason, endNotes: row.end_notes,
    autoSendReceiptEmail: Boolean(row.auto_send_receipt_email),
    automationEnabled: Boolean(row.automation_enabled),
    isCurrent: Boolean(row.is_current),
    created_at: row.created_at, updated_at: row.updated_at,
  };
}

function hydrateDoc(row: DocRow): RentalLeaseDocument {
  return {
    id: row.id, user_id: row.user_id, leaseId: row.lease_id,
    docType: row.doc_type as LeaseDocumentType,
    filePath: row.file_path, label: row.label, created_at: row.created_at,
  };
}

async function persistLeaseStatus(lease: RentalLease): Promise<LeaseStoredStatus> {
  const display = computeLeaseDisplayStatus(lease);
  let stored: LeaseStoredStatus = lease.status;
  if (lease.isCurrent && display === 'ending_soon' && stored === 'active') stored = 'ending_soon';
  if (lease.isCurrent && display === 'ended' && (stored === 'active' || stored === 'ending_soon')) stored = 'ended';
  if (stored !== lease.status) {
    await db.prepare(`UPDATE rental_leases SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(stored, lease.id);
  }
  return stored;
}

export async function syncAllLeaseStatuses(userId: number) {
  await syncAndLoadCurrentLeases(userId);
}

/** Read current leases without persisting derived status (dashboard / detail GET). */
export async function loadCurrentLeases(userId: number): Promise<Map<number, RentalLease>> {
  const rows = await db.prepare(
    'SELECT * FROM rental_leases WHERE user_id = ? AND is_current = 1'
  ).all(userId) as LeaseRow[];
  const map = new Map<number, RentalLease>();
  for (const row of rows) {
    const lease = hydrateLease(row);
    map.set(lease.unitId, lease);
  }
  return map;
}

/** Sync current-lease statuses once and return them keyed by unit id. */
export async function syncAndLoadCurrentLeases(userId: number): Promise<Map<number, RentalLease>> {
  const rows = await db.prepare(
    'SELECT * FROM rental_leases WHERE user_id = ? AND is_current = 1'
  ).all(userId) as LeaseRow[];
  const map = new Map<number, RentalLease>();
  for (const row of rows) {
    const lease = hydrateLease(row);
    const status = await persistLeaseStatus(lease);
    map.set(lease.unitId, { ...lease, status });
  }
  return map;
}

/** Current lease for a unit without writing derived status. */
export async function getCurrentLeaseForUnitReadOnly(
  unitId: number | string,
  userId: number,
): Promise<RentalLease | null> {
  const row = await db.prepare(
    `SELECT * FROM rental_leases WHERE unit_id = ? AND user_id = ? AND is_current = 1 ORDER BY id DESC LIMIT 1`
  ).get(unitId, userId) as LeaseRow | undefined;
  return row ? hydrateLease(row) : null;
}

export async function getCurrentLeaseForUnit(unitId: number | string, userId: number): Promise<RentalLease | null> {
  const row = await db.prepare(
    `SELECT * FROM rental_leases WHERE unit_id = ? AND user_id = ? AND is_current = 1 ORDER BY id DESC LIMIT 1`
  ).get(unitId, userId) as LeaseRow | undefined;
  if (!row) return null;
  const lease = hydrateLease(row);
  const status = await persistLeaseStatus(lease);
  return { ...lease, status };
}

export function buildRentalDashboardAlerts(
  units: Array<{ id: number; unitName: string }>,
  leaseByUnitId: Map<number, RentalLease>,
  recordByUnitId: Map<number, { actualAmount: number; amountPaid: number }>,
  _period: string,
): RentalDashboardAlert[] {
  const alerts: RentalDashboardAlert[] = [];

  for (const unit of units) {
    const lease = leaseByUnitId.get(unit.id);
    if (!lease) {
      alerts.push({
        type: 'vacant', unitId: unit.id, unitName: unit.unitName, tenantName: '—',
        message: `${unit.unitName} has no active lease (空置)`,
      });
      continue;
    }

    const display = computeLeaseDisplayStatus(lease);
    const days = daysRemainingForLease(lease);

    if (display === 'ending_soon') {
      alerts.push({
        type: 'ending_soon', unitId: unit.id, unitName: unit.unitName,
        tenantName: lease.tenantName, leaseId: lease.id, daysRemaining: days,
        message: `${unit.unitName} · ${lease.tenantName} — contract ends ${lease.leaseEndDate} (${days} days)`,
      });
    }

    const endIso = normalizeStoredDate(lease.actualEndDate || lease.leaseEndDate);
    if (endIso && new Date().toISOString().slice(0, 10) > endIso && lease.status === 'active') {
      alerts.push({
        type: 'ended_stale', unitId: unit.id, unitName: unit.unitName,
        tenantName: lease.tenantName, leaseId: lease.id,
        message: `${unit.unitName} — lease ended but still marked active; run End Contract`,
      });
    }

    if (display === 'ended' || display === 'terminated') {
      const rec = recordByUnitId.get(unit.id);
      if (rec) {
        const bal = outstandingBalance(rec);
        if (bal > 0) {
          alerts.push({
            type: 'outstanding_at_end', unitId: unit.id, unitName: unit.unitName,
            tenantName: lease.tenantName, leaseId: lease.id,
            message: `${unit.unitName} — ${formatMoney(bal)} outstanding at contract end`,
          });
        }
      }
    }
  }

  return alerts;
}

export async function getRentalDashboardAlerts(userId: number, period = currentBillingPeriod()): Promise<RentalDashboardAlert[]> {
  const leaseByUnitId = await syncAndLoadCurrentLeases(userId);
  const units = await db.prepare(
    'SELECT id, unit_name FROM rental_units WHERE user_id = ?'
  ).all(userId) as { id: number; unit_name: string }[];

  const recordRows = await db.prepare(
    `SELECT unit_id, actual_amount, amount_paid FROM rental_records
     WHERE user_id = ? AND billing_period = ?`
  ).all(userId, period) as { unit_id: number; actual_amount: number; amount_paid: number }[];
  const recordByUnitId = new Map(
    recordRows.map((r) => [
      r.unit_id,
      { actualAmount: Number(r.actual_amount) || 0, amountPaid: Number(r.amount_paid) || 0 },
    ]),
  );

  return buildRentalDashboardAlerts(
    units.map((u) => ({ id: u.id, unitName: u.unit_name })),
    leaseByUnitId,
    recordByUnitId,
    period,
  );
}

export async function getLeaseHistory(unitId: number | string, userId: number): Promise<RentalLease[]> {
  return (await db.prepare(
    `SELECT * FROM rental_leases WHERE unit_id = ? AND user_id = ? ORDER BY lease_start_date DESC, id DESC`
  ).all(unitId, userId) as LeaseRow[]).map(hydrateLease);
}

/** All ended / terminated leases across units (master-panel history). */
export async function getPreviousLeasesForUser(userId: number): Promise<PreviousLeaseRecord[]> {
  const rows = await db.prepare(
    `SELECT l.*, u.unit_name
     FROM rental_leases l
     JOIN rental_units u ON u.id = l.unit_id AND u.user_id = l.user_id
     WHERE l.user_id = ? AND l.is_current = 0
       AND l.status IN ('ended', 'terminated')
     ORDER BY COALESCE(l.actual_end_date, l.lease_end_date) DESC, l.id DESC`
  ).all(userId) as (LeaseRow & { unit_name: string })[];

  return rows.map((row) => ({
    leaseId: row.id,
    unitId: row.unit_id,
    unitName: row.unit_name,
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
    leaseStartDate: row.lease_start_date,
    leaseEndDate: row.lease_end_date,
    actualEndDate: row.actual_end_date,
    status: row.status as LeaseStoredStatus,
    statusLabel: pastLeaseStatusLabel(row.status as LeaseStoredStatus),
  }));
}

export async function getLeaseById(leaseId: number | string, userId: number): Promise<RentalLease | null> {
  const row = await db.prepare('SELECT * FROM rental_leases WHERE id = ? AND user_id = ?').get(leaseId, userId) as LeaseRow | undefined;
  return row ? hydrateLease(row) : null;
}

export async function getLeaseDocuments(leaseId: number, userId: number): Promise<RentalLeaseDocument[]> {
  return (await db.prepare(
    'SELECT * FROM rental_lease_documents WHERE lease_id = ? AND user_id = ? ORDER BY created_at DESC'
  ).all(leaseId, userId) as DocRow[]).map(hydrateDoc);
}

async function syncUnitFromLease(unitId: number, userId: number, lease: RentalLease | null) {
  if (!lease) {
    await db.prepare(
      `UPDATE rental_units SET tenant_name = '', tenant_phone = NULL, tenant_email = NULL,
        tenant_id = NULL, current_lease_id = NULL, automation_enabled = 0, updated_at = datetime('now')
       WHERE id = ? AND user_id = ?`
    ).run(unitId, userId);
    return;
  }
  await db.prepare(
    `UPDATE rental_units SET tenant_name = ?, tenant_phone = ?, tenant_email = ?,
      current_year_rent = ?, lease_start_date = ?, lease_end_date = ?,
      due_date_day = ?, auto_send_receipt_email = ?, automation_enabled = ?,
      current_lease_id = ?, updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`
  ).run(
    lease.tenantName, lease.tenantPhone || null, lease.tenantEmail || null,
    lease.baseRent, lease.leaseStartDate, lease.leaseEndDate,
    lease.dueDateDay, lease.autoSendReceiptEmail ? 1 : 0, lease.automationEnabled ? 1 : 0,
    lease.id, unitId, userId,
  );
}

export async function createLeaseForUnit(
  userId: number,
  unitId: number,
  input: {
    tenantName: string;
    tenantPhone?: string;
    tenantEmail?: string;
    leaseStartDate: string;
    leaseEndDate: string;
    baseRent?: number;
    dueDateDay?: number;
    depositAmount?: number;
    autoSendReceiptEmail?: boolean;
    automationEnabled?: boolean;
  },
): Promise<RentalLease> {
  await db.prepare('UPDATE rental_leases SET is_current = 0, updated_at = datetime(\'now\') WHERE unit_id = ? AND user_id = ? AND is_current = 1')
    .run(unitId, userId);

  const tenant = await findOrCreateTenant(userId, input.tenantName, input.tenantPhone, input.tenantEmail);
  const res = await db.prepare(
    `INSERT INTO rental_leases
      (user_id, unit_id, tenant_id, tenant_name, tenant_phone, tenant_email,
       lease_start_date, lease_end_date, base_rent, due_date_day, deposit_amount,
       auto_send_receipt_email, automation_enabled, is_current, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'active')`
  ).run(
    userId, unitId, tenant.id, input.tenantName.trim(),
    input.tenantPhone?.trim() || null, input.tenantEmail?.trim() || null,
    normalizeStoredDate(input.leaseStartDate) || input.leaseStartDate,
    normalizeStoredDate(input.leaseEndDate) || input.leaseEndDate,
    Number(input.baseRent) || 0, Number(input.dueDateDay) || 1,
    Number(input.depositAmount) || 0,
    input.autoSendReceiptEmail ? 1 : 0,
    input.automationEnabled !== false ? 1 : 0,
  );

  const lease = (await getLeaseById(Number(res.lastInsertRowid), userId))!;
  await syncUnitFromLease(unitId, userId, lease);
  await db.prepare('UPDATE rental_units SET tenant_id = ? WHERE id = ? AND user_id = ?').run(tenant.id, unitId, userId);
  return lease;
}

export async function ensureCurrentLeaseFromUnit(unit: RentalUnit): Promise<RentalLease | null> {
  const existing = await getCurrentLeaseForUnit(unit.id, unit.user_id);
  if (existing) return existing;
  if (isVacantUnitName(unit.tenantName)) return null;
  return await createLeaseForUnit(unit.user_id, unit.id, {
    tenantName: unit.tenantName,
    tenantPhone: unit.tenantPhone,
    tenantEmail: unit.tenantEmail,
    leaseStartDate: unit.leaseStartDate || new Date().toISOString().slice(0, 10),
    leaseEndDate: unit.leaseEndDate || unit.leaseStartDate || new Date().toISOString().slice(0, 10),
    baseRent: unit.currentYearRent,
    dueDateDay: unit.dueDateDay,
    autoSendReceiptEmail: unit.autoSendReceiptEmail,
    automationEnabled: unit.automationEnabled,
  });
}

export async function updateCurrentLeaseFromUnit(unit: RentalUnit, extra?: { depositAmount?: number }) {
  const lease = await ensureCurrentLeaseFromUnit(unit);
  if (!lease) return null;
  const tenant = await ensureUnitTenantLink(unit);
  const depositAmount = extra?.depositAmount !== undefined
    ? Number(extra.depositAmount) || 0
    : lease.depositAmount;
  await db.prepare(
    `UPDATE rental_leases SET tenant_id = ?, tenant_name = ?, tenant_phone = ?, tenant_email = ?,
      lease_start_date = ?, lease_end_date = ?, base_rent = ?, due_date_day = ?,
      deposit_amount = ?, auto_send_receipt_email = ?, automation_enabled = ?, updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`
  ).run(
    tenant?.id ?? lease.tenantId, unit.tenantName, unit.tenantPhone || null, unit.tenantEmail || null,
    normalizeStoredDate(unit.leaseStartDate) || lease.leaseStartDate,
    normalizeStoredDate(unit.leaseEndDate) || lease.leaseEndDate,
    unit.currentYearRent, unit.dueDateDay,
    depositAmount,
    unit.autoSendReceiptEmail ? 1 : 0, unit.automationEnabled ? 1 : 0,
    lease.id, unit.user_id,
  );
  return await getLeaseById(lease.id, unit.user_id);
}

export async function endRentalContract(
  userId: number,
  unitId: number,
  input: {
    actualEndDate?: string;
    endReason?: 'expired' | 'terminated';
    depositRefund?: number;
    depositDeductions?: number;
    endNotes?: string;
    startNewLease?: {
      tenantName: string;
      tenantPhone?: string;
      tenantEmail?: string;
      leaseStartDate: string;
      leaseEndDate: string;
      baseRent?: number;
      dueDateDay?: number;
      depositAmount?: number;
      autoSendReceiptEmail?: boolean;
      automationEnabled?: boolean;
    };
  },
) {
  const lease = await getCurrentLeaseForUnit(unitId, userId);
  if (!lease) throw new Error('No active lease for this unit');

  const actualEnd = normalizeStoredDate(input.actualEndDate) || new Date().toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const endIso = normalizeStoredDate(lease.leaseEndDate) || '';
  const reason = input.endReason || (actualEnd < endIso ? 'terminated' : 'expired');
  const status: LeaseStoredStatus = reason === 'terminated' ? 'terminated' : 'ended';

  await db.prepare(
    `UPDATE rental_leases SET is_current = 0, status = ?, actual_end_date = ?,
      deposit_refund = ?, deposit_deductions = ?, end_reason = ?, end_notes = ?,
      automation_enabled = 0, updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`
  ).run(
    status, actualEnd,
    input.depositRefund ?? null, Number(input.depositDeductions) || 0,
    reason, input.endNotes?.trim() || null,
    lease.id, userId,
  );

  await syncUnitFromLease(unitId, userId, null);
  await db.prepare(
    `UPDATE rental_units SET tenant_id = NULL, tenant_name = ?,
      tenant_phone = NULL, tenant_email = NULL, automation_enabled = 0,
      current_lease_id = NULL, updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`
  ).run(VACANT_TENANT_NAME, unitId, userId);

  let newLease: RentalLease | null = null;
  if (input.startNewLease?.tenantName?.trim()) {
    newLease = await createLeaseForUnit(userId, unitId, input.startNewLease);
  }

  return {
    endedLease: (await getLeaseById(lease.id, userId))!,
    newLease,
  };
}

export async function addLeaseDocument(
  userId: number,
  leaseId: number,
  buffer: Buffer,
  mimeType: string,
  docType: LeaseDocumentType,
  label?: string | null,
): Promise<RentalLeaseDocument> {
  const lease = await getLeaseById(leaseId, userId);
  if (!lease) throw new Error('Lease not found');
  const filePath = await saveReceipt(buffer, mimeType, 'lease-doc');
  const res = await db.prepare(
    `INSERT INTO rental_lease_documents (user_id, lease_id, doc_type, file_path, label) VALUES (?, ?, ?, ?, ?)`
  ).run(userId, leaseId, docType, filePath, label?.trim() || null);
  return hydrateDoc(
    await db.prepare('SELECT * FROM rental_lease_documents WHERE id = ?').get(Number(res.lastInsertRowid)) as DocRow
  );
}

function daysRemainingForLease(lease: RentalLease): number | null {
  const end = lease.actualEndDate || lease.leaseEndDate;
  if (!end) return null;
  const iso = normalizeStoredDate(end) || end;
  const endDate = new Date(`${iso}T23:59:59`);
  if (Number.isNaN(endDate.getTime())) return null;
  return Math.ceil((endDate.getTime() - Date.now()) / 86400000);
}

export async function shouldAutoDispatchInvoice(
  userId: number,
  unitId: number,
  period: string,
): Promise<{ allowed: boolean; reason?: string }> {
  const lease = await getCurrentLeaseForUnit(unitId, userId);
  if (!lease) return { allowed: false, reason: 'No active lease' };
  if (!isLeaseBillingActive(lease, period)) {
    const endDate = lease.actualEndDate || lease.leaseEndDate;
    if (billingPeriodAfterLeaseEnd(period, endDate)) {
      return { allowed: false, reason: `Billing period ${period} is after lease end ${endDate}` };
    }
    const display = computeLeaseDisplayStatus(lease);
    if (display === 'ended' || display === 'terminated') {
      return { allowed: false, reason: 'Contract ended' };
    }
    if (!lease.automationEnabled) return { allowed: false, reason: 'Automation disabled' };
    return { allowed: false, reason: 'Lease not billable' };
  }
  return { allowed: true };
}

export async function unitOutstandingTotal(unitId: number, userId: number): Promise<number> {
  const rows = await db.prepare(
    `SELECT actual_amount, amount_paid, status FROM rental_records WHERE unit_id = ? AND user_id = ?`
  ).all(unitId, userId) as { actual_amount: number; amount_paid: number; status: string }[];
  return rows.reduce((s, r) => {
    const bal = outstandingBalance({ actualAmount: r.actual_amount, amountPaid: r.amount_paid });
    return displayRentalStatus({ status: r.status as 'pending', actualAmount: r.actual_amount, amountPaid: r.amount_paid }) !== 'paid'
      ? s + bal : s;
  }, 0);
}

/** All leases (current + past) for a tenant across every unit they occupied. */
export async function getTenantLeaseHistory(tenantId: number | string, userId: number) {
  const rows = await db.prepare(
    `SELECT l.*, u.unit_name
     FROM rental_leases l
     JOIN rental_units u ON u.id = l.unit_id AND u.user_id = l.user_id
     WHERE l.tenant_id = ? AND l.user_id = ?
     ORDER BY l.lease_start_date DESC, l.id DESC`
  ).all(tenantId, userId) as (LeaseRow & { unit_name: string })[];

  return await Promise.all(rows.map(async (row) => {
    const lease = hydrateLease(row);
    const status = row.is_current ? await persistLeaseStatus(lease) : lease.status;
    return {
      ...lease,
      status,
      unitName: row.unit_name || `Unit ${row.unit_id}`,
    };
  }));
}
