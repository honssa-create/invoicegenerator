import db from './db';
import {
  CHARGE_TYPE_LABELS,
  chargeOutstanding,
  cellPaymentStatus,
  deriveChargeItemStatus,
  debitNoteDueDate,
  dueDateForPeriod,
  formatDueDateChinese,
  formatBillingPeriodLabel,
  formatDebitNoteChargeDescription,
  formatDebitNotePeriodLong,
  formatDisplayDate,
  formatPeriodRangeShort,
  buildDebitNoteFooterRemark,
  buildDebitNotePaymentInstructionsText,
  defaultPaymentTemplateForUnits,
  formatDebitNoteUnitLabel,
  resolveDebitNoteCompanyHeader,
  resolveDebitNoteCompanyIds,
  displayRentalStatus,
  type DebitNoteCompanyInfo,
  type DebitNotePaymentTemplateId,
  type FormalDebitNote,
  type FormalDebitNoteArrearRow,
  type FormalDebitNoteLine,
  type RentalChargeItem,
  type RentalChargeItemStatus,
  type RentalChargeType,
  CHARGE_DISPLAY_ORDER,
  CHARGE_SORT,
  type RentalPayment,
  type RentalPaymentAllocation,
  type RentalPaymentAllocationDetail,
  type RentalPaymentWithAllocations,
  type RentalTenant,
  type RentalUnit,
  type RentPaymentNoticeMatrix,
  type RentPaymentNoticeQuery,
  type TenantLeaseHistoryRow,
  type TenantProfileSummary,
  type RentPaymentNoticeSummary,
  type RentRecord,
  type PeriodPaymentAllocation,
  type TenantBillingHistoryRow,
  type UtilityBillingMode,
  resolveUtilityBillingMode,
  utilityChargeTypesForMode,
} from './rentals';
import { getTenantLeaseHistory } from './rental-lease-server';

function logRentalActivity(
  userId: number, unitId: number, action: string,
  note?: string | null, rentRecordId?: number | null,
) {
  db.prepare(
    'INSERT INTO rental_activity_logs (user_id, unit_id, rent_record_id, action, note) VALUES (?, ?, ?, ?, ?)'
  ).run(userId, unitId, rentRecordId ?? null, action, note?.trim() || null);
}

// ---------------------------------------------------------------------------
// Row hydrators
// ---------------------------------------------------------------------------

interface TenantRow {
  id: number; user_id: number; name: string;
  phone: string | null; email: string | null; notes: string | null;
  utility_billing_mode?: string | null;
  created_at: string; updated_at: string;
}

interface ChargeRow {
  id: number; user_id: number; tenant_id?: number | null; unit_id: number; billing_period: string;
  charge_type: RentalChargeType; amount_due: number; amount_allocated: number;
  status?: RentalChargeItemStatus;
  legacy_record_id: number | null; created_at: string; updated_at: string;
}

interface PaymentRow {
  id: number; user_id: number; tenant_id: number; payment_date: string;
  amount: number; receipt_image_path: string | null; method: string | null;
  reference: string | null; notes: string | null; created_at: string; updated_at: string;
}

interface AllocationRow {
  id: number; user_id: number; payment_id: number; charge_item_id: number;
  amount: number; created_at: string;
}

function normalizeUtilityBillingMode(value: string | null | undefined): UtilityBillingMode {
  return value === 'tenant_pays' ? 'tenant_pays' : 'company_proxy';
}

function hydrateTenant(row: TenantRow, unitCount = 0): RentalTenant {
  return {
    id: row.id, user_id: row.user_id, name: row.name,
    phone: row.phone || '', email: row.email || '', notes: row.notes || '',
    utilityBillingMode: normalizeUtilityBillingMode(row.utility_billing_mode),
    unitCount, created_at: row.created_at, updated_at: row.updated_at,
  };
}

function hydrateCharge(row: ChargeRow): RentalChargeItem {
  const amountDue = row.amount_due || 0;
  const amountAllocated = row.amount_allocated || 0;
  const status = row.status && ['empty', 'unpaid', 'partially_paid', 'paid'].includes(row.status)
    ? row.status
    : deriveChargeItemStatus(amountDue, amountAllocated);
  return {
    id: row.id, user_id: row.user_id, tenantId: row.tenant_id ?? null, unitId: row.unit_id,
    billingPeriod: row.billing_period, chargeType: row.charge_type,
    amountDue, amountAllocated, status,
    legacyRecordId: row.legacy_record_id, created_at: row.created_at, updated_at: row.updated_at,
  };
}

function refreshChargeItemStatus(chargeItemId: number) {
  const row = db.prepare(
    'SELECT amount_due, amount_allocated FROM rental_charge_items WHERE id = ?'
  ).get(chargeItemId) as { amount_due: number; amount_allocated: number } | undefined;
  if (!row) return;
  const status = deriveChargeItemStatus(row.amount_due || 0, row.amount_allocated || 0);
  db.prepare(
    `UPDATE rental_charge_items SET status = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(status, chargeItemId);
}

function paymentAllocated(paymentId: number): number {
  const row = db.prepare(
    'SELECT COALESCE(SUM(amount), 0) AS total FROM rental_payment_allocations WHERE payment_id = ?'
  ).get(paymentId) as { total: number };
  return row.total || 0;
}

function hydratePayment(row: PaymentRow): RentalPayment {
  const allocated = paymentAllocated(row.id);
  return {
    id: row.id, user_id: row.user_id, tenantId: row.tenant_id,
    paymentDate: row.payment_date, amount: row.amount || 0,
    receiptImagePath: row.receipt_image_path, method: row.method,
    reference: row.reference, notes: row.notes,
    amountAllocated: allocated, amountUnallocated: Math.max(0, (row.amount || 0) - allocated),
    created_at: row.created_at, updated_at: row.updated_at,
  };
}

function hydrateAllocation(row: AllocationRow): RentalPaymentAllocation {
  return {
    id: row.id, user_id: row.user_id, paymentId: row.payment_id,
    chargeItemId: row.charge_item_id, amount: row.amount, created_at: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// Tenant helpers
// ---------------------------------------------------------------------------

export function findOrCreateTenant(
  userId: number,
  name: string,
  phone?: string | null,
  email?: string | null,
): RentalTenant {
  const trimmed = name.trim();
  const existing = db.prepare(
    'SELECT * FROM rental_tenants WHERE user_id = ? AND name = ? COLLATE NOCASE LIMIT 1'
  ).get(userId, trimmed) as TenantRow | undefined;
  if (existing) return hydrateTenant(existing);
  const res = db.prepare(
    'INSERT INTO rental_tenants (user_id, name, phone, email) VALUES (?, ?, ?, ?)'
  ).run(userId, trimmed, phone?.trim() || null, email?.trim() || null);
  return getRentalTenant(Number(res.lastInsertRowid), userId)!;
}

export function getRentalTenant(id: number | string, userId: number): RentalTenant | null {
  const row = db.prepare('SELECT * FROM rental_tenants WHERE id = ? AND user_id = ?').get(id, userId) as TenantRow | undefined;
  if (!row) return null;
  const count = (db.prepare('SELECT COUNT(*) AS c FROM rental_units WHERE tenant_id = ? AND user_id = ?').get(id, userId) as { c: number }).c;
  return hydrateTenant(row, count);
}

export function updateRentalTenant(
  tenantId: number | string,
  userId: number,
  input: {
    name?: string;
    phone?: string | null;
    email?: string | null;
    notes?: string | null;
    utilityBillingMode?: UtilityBillingMode;
  },
): RentalTenant | null {
  const existing = getRentalTenant(tenantId, userId);
  if (!existing) return null;

  const name = input.name !== undefined ? input.name.trim() : existing.name;
  const phone = input.phone !== undefined ? (input.phone?.trim() || null) : (existing.phone || null);
  const email = input.email !== undefined ? (input.email?.trim() || null) : (existing.email || null);
  const notes = input.notes !== undefined ? (input.notes?.trim() || null) : (existing.notes || null);
  const utilityBillingMode = input.utilityBillingMode !== undefined
    ? normalizeUtilityBillingMode(input.utilityBillingMode)
    : existing.utilityBillingMode;

  if (!name) throw new Error('Tenant name is required');

  db.prepare(
    `UPDATE rental_tenants SET name = ?, phone = ?, email = ?, notes = ?, utility_billing_mode = ?,
      updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`
  ).run(name, phone, email, notes, utilityBillingMode, tenantId, userId);

  db.prepare(
    `UPDATE rental_units SET tenant_name = ?, tenant_phone = ?, tenant_email = ?, updated_at = datetime('now')
     WHERE tenant_id = ? AND user_id = ?`
  ).run(name, phone, email, tenantId, userId);

  db.prepare(
    `UPDATE rental_leases SET tenant_name = ?, tenant_phone = ?, tenant_email = ?, updated_at = datetime('now')
     WHERE tenant_id = ? AND user_id = ?`
  ).run(name, phone, email, tenantId, userId);

  return getRentalTenant(tenantId, userId);
}

export function listRentalTenants(userId: number): RentalTenant[] {
  const rows = db.prepare(
    `SELECT t.*, (SELECT COUNT(*) FROM rental_units u WHERE u.tenant_id = t.id AND u.user_id = t.user_id) AS unit_count
     FROM rental_tenants t WHERE t.user_id = ? ORDER BY t.name COLLATE NOCASE ASC`
  ).all(userId) as (TenantRow & { unit_count: number })[];
  return rows.map((r) => hydrateTenant(r, r.unit_count));
}

export function linkUnitToTenant(unitId: number, userId: number, tenantId: number) {
  db.prepare('UPDATE rental_units SET tenant_id = ?, updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?')
    .run(tenantId, unitId, userId);
}

export function getTenantUnits(tenantId: number, userId: number): Pick<RentalUnit, 'id' | 'unitName' | 'tenantName' | 'currentYearRent' | 'utilityBillingMode'>[] {
  return (db.prepare(
    'SELECT id, unit_name, tenant_name, current_year_rent, utility_billing_mode FROM rental_units WHERE tenant_id = ? AND user_id = ? ORDER BY unit_name COLLATE NOCASE'
  ).all(tenantId, userId) as { id: number; unit_name: string; tenant_name: string; current_year_rent: number; utility_billing_mode?: string | null }[]).map((r) => ({
    id: r.id, unitName: r.unit_name, tenantName: r.tenant_name, currentYearRent: r.current_year_rent || 0,
    utilityBillingMode: normalizeUtilityBillingMode(r.utility_billing_mode),
  }));
}

/** Current units plus any unit ever linked via lease history (for former tenants). */
export function getTenantUnitNameMap(tenantId: number, userId: number): Record<number, string> {
  const rows = db.prepare(
    `SELECT DISTINCT u.id, u.unit_name
     FROM rental_units u
     WHERE u.user_id = ?
       AND (u.tenant_id = ? OR u.id IN (
         SELECT unit_id FROM rental_leases WHERE tenant_id = ? AND user_id = ?
       ))
     ORDER BY u.unit_name COLLATE NOCASE`
  ).all(userId, tenantId, tenantId, userId) as { id: number; unit_name: string }[];
  return Object.fromEntries(rows.map((r) => [r.id, r.unit_name]));
}

/** Resolve tenant id from a rental unit (for notice links from unit context). */
export function getTenantIdForUnit(unitId: number | string, userId: number): number | null {
  const row = db.prepare(
    'SELECT tenant_id FROM rental_units WHERE id = ? AND user_id = ?'
  ).get(unitId, userId) as { tenant_id: number | null } | undefined;
  return row?.tenant_id ?? null;
}

export function buildRentPaymentNoticeForUnit(
  unitId: number | string,
  userId: number,
  targetPeriod: string,
  options?: string | RentPaymentNoticeQuery,
): RentPaymentNoticeMatrix | null {
  const tenantId = getTenantIdForUnit(unitId, userId);
  if (!tenantId) return null;
  return buildRentPaymentNoticeMatrix(tenantId, userId, targetPeriod, options);
}

// ---------------------------------------------------------------------------
// Charge item sync from legacy rental_records (parallel run)
// ---------------------------------------------------------------------------

const CHARGE_ORDER: RentalChargeType[] = CHARGE_DISPLAY_ORDER;

function distributeLegacyPaid(amountPaid: number, dues: { id: number; due: number }[]) {
  let remaining = amountPaid || 0;
  const setAllocated = db.prepare(
    `UPDATE rental_charge_items SET amount_allocated = ?, updated_at = datetime('now') WHERE id = ?`
  );
  for (const item of dues) {
    const alloc = Math.min(remaining, item.due);
    setAllocated.run(alloc, item.id);
    remaining -= alloc;
  }
}

export function syncChargeItemsFromRecord(record: RentRecord) {
  const unitTenant = db.prepare(
    'SELECT tenant_id FROM rental_units WHERE id = ? AND user_id = ?'
  ).get(record.unitId, record.user_id) as { tenant_id: number | null } | undefined;
  const tenantId = unitTenant?.tenant_id ?? null;

  const charges: [RentalChargeType, number][] = [
    ['rent', record.baseRent || 0],
    ['water', record.waterFee || 0],
    ['electricity', record.electricityFee || 0],
  ];
  const upsert = db.prepare(
    `INSERT INTO rental_charge_items (user_id, tenant_id, unit_id, billing_period, charge_type, amount_due, amount_allocated, legacy_record_id)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)
     ON CONFLICT(user_id, unit_id, billing_period, charge_type) DO UPDATE SET
       amount_due = excluded.amount_due,
       tenant_id = excluded.tenant_id,
       legacy_record_id = excluded.legacy_record_id,
       updated_at = datetime('now')`
  );
  const itemIds: { id: number; due: number }[] = [];
  for (const [type, due] of charges) {
    upsert.run(record.user_id, tenantId, record.unitId, record.billingPeriod, type, due, record.id);
    const row = db.prepare(
      `SELECT id, amount_due FROM rental_charge_items
       WHERE user_id = ? AND unit_id = ? AND billing_period = ? AND charge_type = ?`
    ).get(record.user_id, record.unitId, record.billingPeriod, type) as { id: number; amount_due: number };
    itemIds.push({ id: row.id, due: row.amount_due });
  }

  const manualAlloc = (db.prepare(
    `SELECT COALESCE(SUM(a.amount), 0) AS total
     FROM rental_payment_allocations a
     JOIN rental_charge_items c ON c.id = a.charge_item_id
     WHERE c.legacy_record_id = ?`
  ).get(record.id) as { total: number }).total;

  if (manualAlloc > 0) {
    const byItem = db.prepare(
      `SELECT c.id, COALESCE(SUM(a.amount), 0) AS allocated
       FROM rental_charge_items c
       LEFT JOIN rental_payment_allocations a ON a.charge_item_id = c.id
       WHERE c.legacy_record_id = ?
       GROUP BY c.id`
    ).all(record.id) as { id: number; allocated: number }[];
    const setAllocated = db.prepare(
      `UPDATE rental_charge_items SET amount_allocated = ?, updated_at = datetime('now') WHERE id = ?`
    );
    for (const row of byItem) {
      setAllocated.run(row.allocated, row.id);
      refreshChargeItemStatus(row.id);
    }
  } else {
    distributeLegacyPaid(record.amountPaid || 0, itemIds);
    for (const item of itemIds) refreshChargeItemStatus(item.id);
  }
}

export function ensureUnitTenantLink(unit: RentalUnit): RentalTenant | null {
  if (!unit.tenantName?.trim()) return null;
  const tenant = findOrCreateTenant(unit.user_id, unit.tenantName, unit.tenantPhone, unit.tenantEmail);
  const row = db.prepare('SELECT tenant_id FROM rental_units WHERE id = ?').get(unit.id) as { tenant_id: number | null } | undefined;
  if (!row?.tenant_id) linkUnitToTenant(unit.id, unit.user_id, tenant.id);
  return tenant;
}

// ---------------------------------------------------------------------------
// Rent Payment Notice matrix
// ---------------------------------------------------------------------------

function periodRange(from: string, to: string): string[] {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  const periods: string[] = [];
  let y = fy;
  let m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    periods.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return periods;
}

function columnLabel(unitName: string, chargeType: RentalChargeType): string {
  if (chargeType === 'rent') return unitName;
  const short = chargeType === 'water' ? '水費' : '電費';
  return `${unitName} ${short}`;
}

function normalizeNoticeQuery(
  options?: string | RentPaymentNoticeQuery,
): RentPaymentNoticeQuery {
  if (typeof options === 'string') return { targetPeriod: '', fromPeriod: options };
  return options ?? {};
}

function periodCharges(charges: RentalChargeItem[], period: string): RentalChargeItem[] {
  return charges.filter((c) => c.billingPeriod === period && c.amountDue > 0);
}

function isPeriodFullyPaid(charges: RentalChargeItem[], period: string): boolean {
  const items = periodCharges(charges, period);
  return items.length > 0 && items.every((c) => chargeOutstanding(c) <= 0);
}

/** Auto-detect matrix rows: arrears + target month + optional paid lookback. */
function resolveNoticePeriods(
  charges: RentalChargeItem[],
  targetPeriod: string,
  options: RentPaymentNoticeQuery,
): { periods: string[]; fromPeriod: string } {
  const paidLookback = options.paidLookbackMonths ?? 2;
  const periodSet = new Set<string>();

  periodSet.add(targetPeriod);

  // Arrears: UNPAID / PARTIALLY_PAID before target_period
  for (const c of charges) {
    if (c.billingPeriod < targetPeriod && c.amountDue > 0 && chargeOutstanding(c) > 0) {
      periodSet.add(c.billingPeriod);
    }
  }

  // Optional: recent fully PAID months for layout (前期已付 rows)
  if (paidLookback > 0) {
    const beforeTarget = new Set(
      charges.filter((c) => c.billingPeriod < targetPeriod && c.amountDue > 0).map((c) => c.billingPeriod),
    );
    const fullyPaid = Array.from(beforeTarget).filter((p) => isPeriodFullyPaid(charges, p)).sort();
    for (const p of fullyPaid.slice(-paidLookback)) periodSet.add(p);
  }

  if (options.fromPeriod) {
    for (const p of periodRange(options.fromPeriod, targetPeriod)) periodSet.add(p);
  }

  const periods = Array.from(periodSet).filter((p) => p <= targetPeriod).sort();
  return { periods, fromPeriod: periods[0] || targetPeriod };
}

/** Dynamic columns: unit × charge_type only where billing items exist. */
function buildNoticeColumns(
  units: Pick<RentalUnit, 'id' | 'unitName' | 'utilityBillingMode'>[],
  charges: RentalChargeItem[],
  tenantMode?: UtilityBillingMode,
): RentPaymentNoticeMatrix['columns'] {
  const cols: RentPaymentNoticeMatrix['columns'] = [];
  for (const unit of units) {
    const chargeTypes = CHARGE_ORDER.filter((t) =>
      utilityChargeTypesForMode(resolveUtilityBillingMode(unit.utilityBillingMode, tenantMode)).includes(t),
    );
    for (const chargeType of chargeTypes) {
      const hasActivity = charges.some(
        (c) => c.unitId === unit.id && c.chargeType === chargeType &&
          (c.amountDue > 0 || c.amountAllocated > 0),
      );
      if (!hasActivity) continue;
      cols.push({
        unitId: unit.id,
        unitName: unit.unitName,
        chargeType,
        label: columnLabel(unit.unitName, chargeType),
      });
    }
  }
  if (!cols.length) {
    return units.flatMap((unit) => {
      const chargeTypes = CHARGE_ORDER.filter((t) =>
        utilityChargeTypesForMode(resolveUtilityBillingMode(unit.utilityBillingMode, tenantMode)).includes(t),
      );
      return chargeTypes.map((chargeType) => ({
        unitId: unit.id,
        unitName: unit.unitName,
        chargeType,
        label: columnLabel(unit.unitName, chargeType),
      }));
    });
  }
  return cols;
}

function getTenantChargeItems(tenantId: number, userId: number, unitIds: number[]): RentalChargeItem[] {
  if (!unitIds.length) return [];
  const placeholders = unitIds.map(() => '?').join(',');
  return (db.prepare(
    `SELECT * FROM rental_charge_items
     WHERE user_id = ? AND unit_id IN (${placeholders})`
  ).all(userId, ...unitIds) as ChargeRow[]).map(hydrateCharge);
}

export function buildRentPaymentNoticeMatrix(
  tenantId: number | string,
  userId: number,
  targetPeriod: string,
  options?: string | RentPaymentNoticeQuery,
): RentPaymentNoticeMatrix | null {
  const query = normalizeNoticeQuery(options);
  const paidLookbackMonths = query.paidLookbackMonths ?? 2;
  const mode = query.mode ?? 'grouped';
  const filterUnitId = query.unitId ?? null;

  if (mode === 'single' && !filterUnitId) {
    throw new Error('unitId is required when mode is single');
  }

  const tenant = getRentalTenant(tenantId, userId);
  if (!tenant) return null;

  let units = getTenantUnits(tenant.id, userId);
  if (mode === 'single' && filterUnitId) {
    units = units.filter((u) => u.id === filterUnitId);
    if (!units.length) return null;
  } else if (query.unitIds?.length) {
    const idSet = new Set(query.unitIds);
    units = units.filter((u) => idSet.has(u.id));
    if (!units.length) return null;
  }

  const emptySummary: RentPaymentNoticeSummary = {
    priorArrearsTotal: 0, priorArrearsPeriods: [], priorPaidTotal: 0, priorPaidPeriods: [],
    currentPeriodDue: 0, currentPeriodOutstanding: 0,
    dueDate: dueDateForPeriod(targetPeriod, 1), dueDateDisplay: formatDisplayDate(dueDateForPeriod(targetPeriod, 1)),
    reminderText: '',
  };

  if (!units.length) {
    return {
      tenant, units, period: targetPeriod, targetPeriod, fromPeriod: targetPeriod,
      mode, unitId: filterUnitId,
      columns: [], rows: [], summary: emptySummary, grandTotal: 0, totalAllocated: 0,
      paidLookbackMonths,
    };
  }

  const unitIds = units.map((u) => u.id);
  let charges = getTenantChargeItems(tenant.id, userId, unitIds);
  if (mode === 'single' && filterUnitId) {
    charges = charges.filter((c) => c.unitId === filterUnitId);
  }

  const unitMeta = db.prepare(
    `SELECT due_date_day FROM rental_units WHERE tenant_id = ? AND user_id = ? LIMIT 1`
  ).get(tenantId, userId) as { due_date_day: number } | undefined;
  const dueDateDay = unitMeta?.due_date_day || 1;
  const dueDate = dueDateForPeriod(targetPeriod, dueDateDay);
  const dueDateDisplay = formatDisplayDate(dueDate);

  const { periods, fromPeriod } = resolveNoticePeriods(charges, targetPeriod, query);
  const columns = buildNoticeColumns(units, charges, tenant.utilityBillingMode);

  const chargeMap = new Map<string, RentalChargeItem>();
  for (const c of charges) {
    chargeMap.set(`${c.unitId}:${c.billingPeriod}:${c.chargeType}`, c);
  }

  let grandTotal = 0;
  let totalAllocated = 0;
  let priorArrearsTotal = 0;
  const priorArrearsPeriods: string[] = [];
  let priorPaidTotal = 0;
  const priorPaidPeriods: string[] = [];
  let currentPeriodDue = 0;
  let currentPeriodOutstanding = 0;

  const rows = periods.map((p) => {
    const cells = columns.map((col) => {
      const item = chargeMap.get(`${col.unitId}:${p}:${col.chargeType}`);
      const amountDue = item?.amountDue || 0;
      const amountAllocated = item?.amountAllocated || 0;
      const outstanding = chargeOutstanding({ amountDue, amountAllocated });
      const status = cellPaymentStatus(item ?? null);
      grandTotal += outstanding;
      totalAllocated += amountAllocated;
      return {
        chargeItemId: item?.id ?? null,
        amountDue,
        amountAllocated,
        outstanding,
        status,
      };
    });
    const rowTotal = cells.reduce((s, c) => s + c.outstanding, 0);
    const rowDue = cells.reduce((s, c) => s + c.amountDue, 0);
    const isFullyPaid = rowDue > 0 && rowTotal <= 0;

    if (p < targetPeriod) {
      if (rowTotal > 0) {
        priorArrearsTotal += rowTotal;
        if (!priorArrearsPeriods.includes(p)) priorArrearsPeriods.push(p);
      } else if (rowDue > 0) {
        priorPaidTotal += rowDue;
        if (!priorPaidPeriods.includes(p)) priorPaidPeriods.push(p);
      }
    } else if (p === targetPeriod) {
      currentPeriodDue = rowDue;
      currentPeriodOutstanding = rowTotal;
    }

    return {
      period: p,
      periodLabel: formatBillingPeriodLabel(p),
      cells,
      rowTotal,
      isFullyPaid,
    };
  });

  const summary: RentPaymentNoticeSummary = {
    priorArrearsTotal,
    priorArrearsPeriods: priorArrearsPeriods.sort(),
    priorPaidTotal,
    priorPaidPeriods: priorPaidPeriods.sort(),
    currentPeriodDue,
    currentPeriodOutstanding,
    dueDate,
    dueDateDisplay,
    reminderText: buildDebitNoteFooterRemark(targetPeriod, dueDateDisplay, priorArrearsPeriods, grandTotal),
  };

  return {
    tenant, units, period: targetPeriod, targetPeriod, fromPeriod, columns, rows, summary,
    grandTotal, totalAllocated, paidLookbackMonths, mode, unitId: filterUnitId,
  };
}

// ---------------------------------------------------------------------------
// Formal debit note (繳費通知單) document builder
// ---------------------------------------------------------------------------

function buildArrearDetails(
  items: { unitName: string; chargeType: RentalChargeType }[],
): string {
  const units = Array.from(new Set(items.map((i) => i.unitName)));
  const types = Array.from(new Set(items.map((i) => i.chargeType)));
  const unitStr = units.join(', ');
  if (types.length === 1 && types[0] === 'rent') return `${unitStr} (全月租金)`;
  const typeLabels = types.map((t) => CHARGE_TYPE_LABELS[t]).join('、');
  return `${unitStr} (${typeLabels})`;
}

function buildSettledPeriodsNote(
  charges: RentalChargeItem[],
  arrearPeriods: string[],
  targetPeriod: string,
): string | null {
  if (!arrearPeriods.length) return null;
  const earliest = arrearPeriods.sort()[0];
  const settled: string[] = [];
  const [ey, em] = earliest.split('-').map(Number);
  const [ty, tm] = targetPeriod.split('-').map(Number);
  let y = ey;
  let m = em;
  while (y < ty || (y === ty && m < tm)) {
    const p = `${y}-${String(m).padStart(2, '0')}`;
    if (!arrearPeriods.includes(p)) {
      const items = charges.filter((c) => c.billingPeriod === p && c.amountDue > 0);
      if (items.length > 0 && items.every((c) => chargeOutstanding(c) <= 0)) {
        settled.push(p);
      }
    }
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  if (!settled.length) return '*註：以下為截至發單日之未結清結餘*';
  const labels = settled.map(formatDebitNotePeriodLong).join('及');
  return `*註：${labels}賬項已結清，以下為截至發單日之未結清結餘*`;
}

export function peekDebitNoteNumber(userId: number, targetPeriod: string): string {
  const ym = targetPeriod.replace('-', '');
  const row = db.prepare(
    'SELECT last_seq FROM rental_debit_note_seq WHERE user_id = ? AND note_month = ?'
  ).get(userId, ym) as { last_seq: number } | undefined;
  const next = (row?.last_seq ?? 0) + 1;
  return `DN-${ym}-${String(next).padStart(4, '0')}`;
}

export function buildFormalDebitNote(
  tenantId: number | string,
  userId: number,
  targetPeriod: string,
  options?: RentPaymentNoticeQuery & { company?: Partial<DebitNoteCompanyInfo> },
): FormalDebitNote | null {
  const matrix = buildRentPaymentNoticeMatrix(tenantId, userId, targetPeriod, options);
  if (!matrix) return null;

  const unitIds = matrix.units.map((u) => u.id);
  const charges = getTenantChargeItems(Number(tenantId), userId, unitIds);
  const unitNameMap = Object.fromEntries(matrix.units.map((u) => [u.id, u.unitName]));
  const unitModeMap = Object.fromEntries(
    matrix.units.map((u) => [u.id, resolveUtilityBillingMode(u.utilityBillingMode, matrix.tenant.utilityBillingMode)]),
  );
  const isBillable = (unitId: number, chargeType: RentalChargeType) =>
    utilityChargeTypesForMode(unitModeMap[unitId] ?? matrix.tenant.utilityBillingMode).includes(chargeType);

  const currentCharges: FormalDebitNoteLine[] = [];
  for (const col of matrix.columns) {
    if (!isBillable(col.unitId, col.chargeType)) continue;
    const item = charges.find(
      (c) => c.unitId === col.unitId && c.billingPeriod === targetPeriod && c.chargeType === col.chargeType,
    );
    if (!item || item.amountDue <= 0) continue;
    const outstanding = chargeOutstanding(item);
    if (outstanding <= 0) continue;
    currentCharges.push({
      unitName: formatDebitNoteUnitLabel(col.unitName),
      description: formatDebitNoteChargeDescription(targetPeriod, col.chargeType),
      amount: outstanding,
      chargeType: col.chargeType,
    });
  }
  currentCharges.sort((a, b) => {
    const unitCmp = a.unitName.localeCompare(b.unitName);
    if (unitCmp !== 0) return unitCmp;
    return CHARGE_SORT[a.chargeType] - CHARGE_SORT[b.chargeType];
  });

  const arrearPeriods = matrix.summary.priorArrearsPeriods.filter(Boolean).sort();
  const arrearRows: FormalDebitNoteArrearRow[] = [];
  for (const p of arrearPeriods) {
    const periodItems = charges.filter(
      (c) => c.billingPeriod === p && chargeOutstanding(c) > 0 && isBillable(c.unitId, c.chargeType),
    );
    if (!periodItems.length) continue;
    const amount = periodItems.reduce((s, c) => s + chargeOutstanding(c), 0);
    arrearRows.push({
      period: p,
      periodLabel: formatBillingPeriodLabel(p),
      details: buildArrearDetails(periodItems.map((c) => ({
        unitName: formatDebitNoteUnitLabel(unitNameMap[c.unitId] || `Unit ${c.unitId}`),
        chargeType: c.chargeType,
      }))),
      amount,
    });
  }

  const currentSubtotal = currentCharges.reduce((s, l) => s + l.amount, 0);
  const totalArrears = arrearRows.reduce((s, r) => s + r.amount, 0);
  const grandTotal = currentSubtotal + totalArrears;

  const companyIds = resolveDebitNoteCompanyIds(matrix.units.map((u) => u.unitName));
  const company: DebitNoteCompanyInfo = { ...resolveDebitNoteCompanyHeader(companyIds), ...options?.company };
  const issuedDate = new Date().toISOString().slice(0, 10);
  const dueDate = debitNoteDueDate(issuedDate);
  const dueDateDisplay = formatDisplayDate(dueDate);
  const dueDateChinese = formatDueDateChinese(dueDateDisplay, targetPeriod.split('-')[0]);

  const addressRows = db.prepare(
    `SELECT id, address FROM rental_units WHERE user_id = ? AND id IN (${unitIds.map(() => '?').join(',')})`
  ).all(userId, ...unitIds) as { id: number; address: string | null }[];
  const addressMap = Object.fromEntries(addressRows.map((r) => [r.id, r.address]));
  const premises = matrix.units
    .map((u) => addressMap[u.id]?.trim() || u.unitName)
    .join(' · ');

  const noteNo = peekDebitNoteNumber(userId, targetPeriod);
  const paymentTemplateId: DebitNotePaymentTemplateId =
    options?.paymentTemplate ?? defaultPaymentTemplateForUnits(matrix.units.map((u) => u.unitName));
  const paymentInstructionsText = options?.paymentInstructionsText ?? buildDebitNotePaymentInstructionsText(
    paymentTemplateId,
    noteNo,
    dueDateChinese,
    options?.paymentRemark,
  );
  const paymentInstructions = paymentInstructionsText.split('\n').filter((l) => l !== '');
  const footerRemark = options?.footerRemark ?? buildDebitNoteFooterRemark(
    targetPeriod,
    dueDateDisplay,
    arrearPeriods,
    grandTotal,
  );

  return {
    noteNo,
    issuedDate,
    issuedDateDisplay: formatDisplayDate(issuedDate),
    dueDate,
    dueDateDisplay,
    tenant: matrix.tenant,
    premises,
    targetPeriod,
    targetPeriodLabel: formatBillingPeriodLabel(targetPeriod),
    company,
    currentCharges,
    currentSubtotal,
    arrearRows,
    settledPeriodsNote: buildSettledPeriodsNote(charges, arrearPeriods, targetPeriod),
    totalArrears,
    grandTotal,
    footerRemark,
    paymentInstructions,
    paymentInstructionsText,
    paymentTemplateId,
    companyIds,
    units: matrix.units,
  };
}

export function getTenantBillingHistory(
  tenantId: number | string,
  userId: number,
): TenantBillingHistoryRow[] {
  const unitNameMap = getTenantUnitNameMap(Number(tenantId), userId);
  const unitIds = Object.keys(unitNameMap).map(Number);
  if (!unitIds.length) return [];
  const placeholders = unitIds.map(() => '?').join(',');

  interface HistoryRow {
    id: number; unit_id: number; billing_period: string;
    base_rent: number; water_fee: number; electricity_fee: number;
    actual_amount: number; amount_paid: number; paid_date: string | null;
    paid_at: string | null; status: string;
  }

  const rows = db.prepare(
    `SELECT r.id, r.unit_id, r.billing_period, r.base_rent, r.water_fee, r.electricity_fee,
            r.actual_amount, r.amount_paid, r.paid_date, r.paid_at, r.status
     FROM rental_records r
     WHERE r.user_id = ? AND r.unit_id IN (${placeholders})
       AND (
         EXISTS (
           SELECT 1 FROM rental_charge_items c
           WHERE c.legacy_record_id = r.id AND c.tenant_id = ? AND c.user_id = ?
         )
         OR EXISTS (
           SELECT 1 FROM rental_leases l
           WHERE l.unit_id = r.unit_id AND l.tenant_id = ? AND l.user_id = ?
             AND r.billing_period >= substr(l.lease_start_date, 1, 7)
             AND r.billing_period <= substr(COALESCE(l.actual_end_date, l.lease_end_date, '9999-12-31'), 1, 7)
         )
       )
     ORDER BY r.billing_period DESC, r.unit_id ASC`
  ).all(userId, ...unitIds, tenantId, userId, tenantId, userId) as HistoryRow[];

  return rows.map((r) => {
    const record: RentRecord = {
      id: r.id, user_id: userId, unitId: r.unit_id, billingPeriod: r.billing_period,
      baseRent: r.base_rent || 0, baseRentPeriodFrom: null, baseRentPeriodTo: null,
      waterFee: r.water_fee || 0, electricityFee: r.electricity_fee || 0,
      waterPeriodFrom: null, waterPeriodTo: null, electricityPeriodFrom: null, electricityPeriodTo: null,
      actualAmount: r.actual_amount || 0, amountPaid: r.amount_paid || 0,
      status: (r.status as RentRecord['status']) || 'pending',
      paidDate: r.paid_date || null, invoiceRef: null, receiptRef: null,
      receiptImagePath: null, invoiceSentAt: null, receiptSentAt: null,
      paidAt: r.paid_at || null, customInvoiceNote: null, customReceiptNote: null,
      electricityMeter: null,
      waterMeter: null,
      created_at: '', updated_at: '',
    };
    return {
      recordId: r.id,
      unitId: r.unit_id,
      unitName: unitNameMap[r.unit_id] || `Unit ${r.unit_id}`,
      billingPeriod: r.billing_period,
      baseRent: r.base_rent || 0,
      waterFee: r.water_fee || 0,
      electricityFee: r.electricity_fee || 0,
      actualAmount: r.actual_amount || 0,
      amountPaid: r.amount_paid || 0,
      paidDate: r.paid_date || r.paid_at?.slice(0, 10) || null,
      status: displayRentalStatus(record),
    };
  });
}

// ---------------------------------------------------------------------------
// Tenant detail — charges, payments, allocations
// ---------------------------------------------------------------------------

export function getTenantLedgerDetail(tenantId: number | string, userId: number) {
  const tenant = getRentalTenant(tenantId, userId);
  if (!tenant) return null;
  const units = getTenantUnits(tenant.id, userId);
  const unitIds = units.map((u) => u.id);
  const unitModeMap = Object.fromEntries(
    units.map((u) => [u.id, resolveUtilityBillingMode(u.utilityBillingMode, tenant.utilityBillingMode)]),
  );

  let outstandingCharges: RentalChargeItem[] = [];
  if (unitIds.length) {
    const placeholders = unitIds.map(() => '?').join(',');
    outstandingCharges = (db.prepare(
      `SELECT * FROM rental_charge_items
       WHERE user_id = ? AND unit_id IN (${placeholders})
         AND amount_due > amount_allocated
       ORDER BY billing_period ASC, unit_id ASC, charge_type ASC`
    ).all(userId, ...unitIds) as ChargeRow[]).map(hydrateCharge);
    outstandingCharges = outstandingCharges.filter(
      (c) => utilityChargeTypesForMode(unitModeMap[c.unitId] ?? tenant.utilityBillingMode).includes(c.chargeType),
    );
  }

  const payments = (db.prepare(
    'SELECT * FROM rental_payments WHERE tenant_id = ? AND user_id = ? ORDER BY payment_date DESC, id DESC'
  ).all(tenantId, userId) as PaymentRow[]).map(hydratePayment);

  const allocationLedger = getTenantAllocationLedger(tenant.id, userId);
  const unitNameMap = getTenantUnitNameMap(tenant.id, userId);
  const paymentsWithAllocations = payments.map((p) => hydratePaymentWithAllocations(p, userId, unitNameMap));
  const billingHistory = getTenantBillingHistory(tenant.id, userId);
  const leaseHistory = getTenantLeaseHistory(tenant.id, userId);

  const totalPaid = payments.reduce((s, p) => s + (p.amount || 0), 0);
  const totalOutstanding = outstandingCharges.reduce((s, c) => s + chargeOutstanding(c), 0);
  const lastPaymentDate = payments.length ? payments[0].paymentDate : null;
  const activeUnits = units.length;
  const contractCount = leaseHistory.length;

  const summary: TenantProfileSummary = {
    activeUnits,
    contractCount,
    totalPaid,
    totalOutstanding,
    lastPaymentDate,
  };

  return { tenant, units, outstandingCharges, payments, paymentsWithAllocations, allocationLedger, billingHistory, leaseHistory, summary };
}

function hydratePaymentWithAllocations(
  payment: RentalPayment,
  userId: number,
  unitNameMap: Record<number, string>,
): RentalPaymentWithAllocations {
  const allocs = getPaymentAllocations(payment.id, userId);
  return {
    ...payment,
    allocations: allocs.map((a) => ({
      id: a.id,
      amount: a.amount,
      chargeItemId: a.chargeItemId,
      unitId: a.charge.unitId,
      unitName: unitNameMap[a.charge.unitId] || `Unit ${a.charge.unitId}`,
      billingPeriod: a.charge.billingPeriod,
      chargeType: a.charge.chargeType,
    })),
  };
}

/** Payment history for a unit (tenant payments filtered to this unit's allocations). */
export function getUnitPaymentHistory(unitId: number, userId: number): RentalPaymentWithAllocations[] {
  const tenantId = getTenantIdForUnit(unitId, userId);
  if (!tenantId) return [];
  const units = getTenantUnits(tenantId, userId);
  const unitNameMap = Object.fromEntries(units.map((u) => [u.id, u.unitName]));
  const payments = (db.prepare(
    'SELECT * FROM rental_payments WHERE tenant_id = ? AND user_id = ? ORDER BY payment_date DESC, id DESC'
  ).all(tenantId, userId) as PaymentRow[]).map(hydratePayment);

  return payments
    .map((p) => hydratePaymentWithAllocations(p, userId, unitNameMap))
    .filter((p) => p.allocations.some((a) => a.unitId === unitId) || p.amountUnallocated > 0)
    .map((p) => ({
      ...p,
      allocations: p.allocations.filter((a) => a.unitId === unitId),
    }));
}

export function getRentalPaymentDetail(paymentId: number | string, userId: number) {
  const row = db.prepare(
    'SELECT * FROM rental_payments WHERE id = ? AND user_id = ?'
  ).get(paymentId, userId) as PaymentRow | undefined;
  if (!row) return null;
  const payment = hydratePayment(row);
  const allocations = getPaymentAllocations(payment.id, userId);
  const unitNames = Object.fromEntries(
    getTenantUnits(payment.tenantId, userId).map((u) => [u.id, u.unitName])
  );
  return {
    payment,
    allocations: allocations.map((a) => ({
      ...a,
      unitName: unitNames[a.charge.unitId] || `Unit ${a.charge.unitId}`,
    })),
  };
}

export function getTenantAllocationLedger(
  tenantId: number,
  userId: number,
): RentalPaymentAllocationDetail[] {
  const rows = db.prepare(
    `SELECT a.id, a.payment_id, a.charge_item_id, a.amount, a.created_at,
            p.payment_date, p.amount AS payment_amount, p.method, p.reference,
            c.unit_id, c.billing_period, c.charge_type, c.amount_due,
            u.unit_name
     FROM rental_payment_allocations a
     JOIN rental_payments p ON p.id = a.payment_id
     JOIN rental_charge_items c ON c.id = a.charge_item_id
     JOIN rental_units u ON u.id = c.unit_id
     WHERE p.tenant_id = ? AND a.user_id = ?
     ORDER BY p.payment_date DESC, a.id DESC`
  ).all(tenantId, userId) as {
    id: number; payment_id: number; charge_item_id: number; amount: number; created_at: string;
    payment_date: string; payment_amount: number; method: string | null; reference: string | null;
    unit_id: number; billing_period: string; charge_type: RentalChargeType; amount_due: number;
    unit_name: string;
  }[];

  return rows.map((r) => ({
    id: r.id,
    paymentId: r.payment_id,
    chargeItemId: r.charge_item_id,
    allocatedAmount: r.amount,
    created_at: r.created_at,
    paymentDate: r.payment_date,
    paymentAmount: r.payment_amount,
    paymentMethod: r.method,
    paymentReference: r.reference,
    unitId: r.unit_id,
    unitName: r.unit_name,
    billingPeriod: r.billing_period,
    chargeType: r.charge_type,
    chargeAmountDue: r.amount_due,
  }));
}

export function getChargeItemsForRecord(recordId: number, userId: number): RentalChargeItem[] {
  return (db.prepare(
    `SELECT * FROM rental_charge_items
     WHERE legacy_record_id = ? AND user_id = ?
     ORDER BY CASE charge_type WHEN 'rent' THEN 1 WHEN 'water' THEN 2 ELSE 3 END`
  ).all(recordId, userId) as ChargeRow[]).map(hydrateCharge);
}

export function getChargeItemByRecordAndType(
  recordId: number,
  userId: number,
  chargeType: RentalChargeType,
): RentalChargeItem | null {
  const row = db.prepare(
    `SELECT * FROM rental_charge_items
     WHERE legacy_record_id = ? AND user_id = ? AND charge_type = ?`
  ).get(recordId, userId, chargeType) as ChargeRow | undefined;
  return row ? hydrateCharge(row) : null;
}

export function getChargeItemsForTenant(tenantId: number, userId: number): RentalChargeItem[] {
  const units = getTenantUnits(tenantId, userId);
  if (!units.length) return [];
  const placeholders = units.map(() => '?').join(',');
  return (db.prepare(
    `SELECT * FROM rental_charge_items WHERE user_id = ? AND unit_id IN (${placeholders})
     ORDER BY billing_period DESC`
  ).all(userId, ...units.map((u) => u.id)) as ChargeRow[]).map(hydrateCharge);
}

/** Outstanding charge items for units, FIFO-sorted (period → unit → rent/water/elec). */
export function getOutstandingChargeItemsForUnits(
  userId: number,
  unitIds: number[],
  chargeTypes?: RentalChargeType[],
): RentalChargeItem[] {
  if (!unitIds.length) return [];
  const placeholders = unitIds.map(() => '?').join(',');
  let items = (db.prepare(
    `SELECT * FROM rental_charge_items
     WHERE user_id = ? AND unit_id IN (${placeholders})
       AND amount_due > amount_allocated
     ORDER BY billing_period ASC, unit_id ASC`
  ).all(userId, ...unitIds) as ChargeRow[]).map(hydrateCharge);
  if (chargeTypes?.length) {
    items = items.filter((c) => chargeTypes.includes(c.chargeType));
  }
  return items.sort(
    (a, b) => a.billingPeriod.localeCompare(b.billingPeriod)
      || a.unitId - b.unitId
      || CHARGE_ORDER.indexOf(a.chargeType) - CHARGE_ORDER.indexOf(b.chargeType),
  );
}

// ---------------------------------------------------------------------------
// Payments + manual allocation
// ---------------------------------------------------------------------------

export function createRentalPayment(
  userId: number,
  input: {
    tenantId: number;
    paymentDate: string;
    amount: number;
    method?: string | null;
    reference?: string | null;
    notes?: string | null;
    receiptImagePath?: string | null;
  },
  allocations?: { chargeItemId: number; amount: number }[],
): RentalPayment | { payment: RentalPayment; allocations: RentalPaymentAllocation[] } {
  const payment = createRentalPaymentOnly(userId, input);
  if (!allocations?.length) return payment;
  const result = applyPaymentAllocations(payment.id, userId, allocations);
  return result;
}

function createRentalPaymentOnly(
  userId: number,
  input: {
    tenantId: number;
    paymentDate: string;
    amount: number;
    method?: string | null;
    reference?: string | null;
    notes?: string | null;
    receiptImagePath?: string | null;
  },
): RentalPayment {
  const res = db.prepare(
    `INSERT INTO rental_payments (user_id, tenant_id, payment_date, amount, method, reference, notes, receipt_image_path)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    userId, input.tenantId, input.paymentDate, input.amount,
    input.method?.trim() || null, input.reference?.trim() || null,
    input.notes?.trim() || null, input.receiptImagePath || null,
  );
  const payment = hydratePayment(
    db.prepare('SELECT * FROM rental_payments WHERE id = ?').get(Number(res.lastInsertRowid)) as PaymentRow
  );
  const units = getTenantUnits(input.tenantId, userId);
  if (units[0]) {
    logRentalActivity(userId, units[0].id, 'Tenant Payment Recorded', `Amount ${input.amount} · ${input.paymentDate}`);
  }
  return payment;
}

function applyPaymentAllocations(
  paymentId: number | string,
  userId: number,
  allocations: { chargeItemId: number; amount: number }[],
): { payment: RentalPayment; allocations: RentalPaymentAllocation[] } {
  const paymentRow = db.prepare(
    'SELECT * FROM rental_payments WHERE id = ? AND user_id = ?'
  ).get(paymentId, userId) as PaymentRow | undefined;
  if (!paymentRow) throw new Error('Payment not found');

  const payment = hydratePayment(paymentRow);
  const totalNew = allocations.reduce((s, a) => s + a.amount, 0);
  if (totalNew <= 0) throw new Error('Allocation amount must be greater than zero');
  if (payment.amountAllocated + totalNew > payment.amount + 0.01) {
    throw new Error('Allocation exceeds payment amount');
  }

  const insertAlloc = db.prepare(
    'INSERT INTO rental_payment_allocations (user_id, payment_id, charge_item_id, amount) VALUES (?, ?, ?, ?)'
  );
  const updateCharge = db.prepare(
    `UPDATE rental_charge_items SET amount_allocated = amount_allocated + ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`
  );
  const getCharge = db.prepare('SELECT * FROM rental_charge_items WHERE id = ? AND user_id = ?');

  const result: RentalPaymentAllocation[] = [];
  const touchedChargeIds: number[] = [];
  const run = db.transaction(() => {
    for (const alloc of allocations) {
      const charge = getCharge.get(alloc.chargeItemId, userId) as ChargeRow | undefined;
      if (!charge) throw new Error(`Charge item ${alloc.chargeItemId} not found`);
      const item = hydrateCharge(charge);
      const outstanding = chargeOutstanding(item);
      if (alloc.amount > outstanding + 0.01) {
        throw new Error(`Allocation ${alloc.amount} exceeds outstanding ${outstanding} for ${item.billingPeriod} ${item.chargeType}`);
      }
      const unit = db.prepare('SELECT tenant_id FROM rental_units WHERE id = ? AND user_id = ?')
        .get(charge.unit_id, userId) as { tenant_id: number | null } | undefined;
      if (unit?.tenant_id !== paymentRow.tenant_id) {
        throw new Error('Charge item does not belong to this tenant');
      }
      const res = insertAlloc.run(userId, payment.id, alloc.chargeItemId, alloc.amount);
      updateCharge.run(alloc.amount, alloc.chargeItemId, userId);
      touchedChargeIds.push(alloc.chargeItemId);
      result.push(hydrateAllocation(
        db.prepare('SELECT * FROM rental_payment_allocations WHERE id = ?').get(Number(res.lastInsertRowid)) as AllocationRow
      ));
    }
    for (const id of touchedChargeIds) refreshChargeItemStatus(id);
  });
  run();

  syncLegacyRecordFromCharges(allocations.map((a) => a.chargeItemId), userId, paymentRow.payment_date);

  const freshPayment = hydratePayment(
    db.prepare('SELECT * FROM rental_payments WHERE id = ?').get(payment.id) as PaymentRow
  );
  const units = getTenantUnits(paymentRow.tenant_id, userId);
  if (units[0]) {
    logRentalActivity(userId, units[0].id, 'Payment Allocated', `Payment #${payment.id} · ${totalNew} allocated`);
  }
  return { payment: freshPayment, allocations: result };
}

export function allocatePayment(
  paymentId: number | string,
  userId: number,
  allocations: { chargeItemId: number; amount: number }[],
): { payment: RentalPayment; allocations: RentalPaymentAllocation[] } {
  return applyPaymentAllocations(paymentId, userId, allocations);
}

/** Apply allocations directly to billing items (when no tenant payment record is needed). */
export function allocateChargeItemsDirect(
  userId: number,
  allocations: { chargeItemId: number; amount: number }[],
) {
  if (!allocations.length) return;
  const updateCharge = db.prepare(
    `UPDATE rental_charge_items SET amount_allocated = amount_allocated + ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`
  );
  const getCharge = db.prepare('SELECT * FROM rental_charge_items WHERE id = ? AND user_id = ?');
  const run = db.transaction(() => {
    for (const alloc of allocations) {
      const charge = getCharge.get(alloc.chargeItemId, userId) as ChargeRow | undefined;
      if (!charge) throw new Error(`Charge item ${alloc.chargeItemId} not found`);
      const item = hydrateCharge(charge);
      const outstanding = chargeOutstanding(item);
      if (alloc.amount > outstanding + 0.01) {
        throw new Error(`Allocation exceeds outstanding for ${item.billingPeriod} ${item.chargeType}`);
      }
      updateCharge.run(alloc.amount, alloc.chargeItemId, userId);
      refreshChargeItemStatus(alloc.chargeItemId);
    }
  });
  run();
  syncLegacyRecordFromCharges(allocations.map((a) => a.chargeItemId), userId);
}

/** Record a tenant payment and immediately allocate to specific billing items (rent/water/electricity). */
export function recordTenantPaymentWithAllocations(
  userId: number,
  input: {
    tenantId: number;
    paymentDate: string;
    amount: number;
    method?: string | null;
    reference?: string | null;
    notes?: string | null;
    receiptImagePath?: string | null;
  },
  allocations: { chargeItemId: number; amount: number }[],
) {
  const payment = createRentalPaymentOnly(userId, input);
  return applyPaymentAllocations(payment.id, userId, allocations);
}

function syncLegacyRecordFromCharges(chargeItemIds: number[], userId: number, paymentDate?: string) {
  const legacyIds = new Set<number>();
  for (const id of chargeItemIds) {
    const row = db.prepare('SELECT legacy_record_id FROM rental_charge_items WHERE id = ? AND user_id = ?')
      .get(id, userId) as { legacy_record_id: number | null } | undefined;
    if (row?.legacy_record_id) legacyIds.add(row.legacy_record_id);
  }
  for (const recordId of Array.from(legacyIds)) {
    const items = (db.prepare(
      'SELECT id, amount_due, amount_allocated FROM rental_charge_items WHERE legacy_record_id = ? AND user_id = ?'
    ).all(recordId, userId) as { id: number; amount_due: number; amount_allocated: number }[]);
    const totalPaid = items.reduce((s, i) => s + (i.amount_allocated || 0), 0);
    const totalDue = items.reduce((s, i) => s + (i.amount_due || 0), 0);
    const fullyPaid = totalPaid >= totalDue - 0.01;
    for (const item of items) refreshChargeItemStatus(item.id);
    if (paymentDate) {
      db.prepare(
        `UPDATE rental_records SET amount_paid = ?, status = ?,
          paid_date = CASE WHEN ? THEN COALESCE(paid_date, ?) ELSE paid_date END,
          paid_at = CASE WHEN ? THEN COALESCE(paid_at, datetime('now')) ELSE paid_at END,
          updated_at = datetime('now')
         WHERE id = ? AND user_id = ?`
      ).run(totalPaid, fullyPaid ? 'paid' : 'pending', fullyPaid ? 1 : 0, paymentDate, fullyPaid ? 1 : 0, recordId, userId);
    } else {
      db.prepare(
        `UPDATE rental_records SET amount_paid = ?, status = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`
      ).run(totalPaid, fullyPaid ? 'paid' : 'pending', recordId, userId);
    }
  }
}

export function getPaymentAllocations(paymentId: number, userId: number): (RentalPaymentAllocation & { charge: RentalChargeItem })[] {
  const rows = db.prepare(
    `SELECT a.*, c.unit_id, c.billing_period, c.charge_type, c.amount_due, c.amount_allocated, c.legacy_record_id, c.updated_at AS charge_updated
     FROM rental_payment_allocations a
     JOIN rental_charge_items c ON c.id = a.charge_item_id
     WHERE a.payment_id = ? AND a.user_id = ?`
  ).all(paymentId, userId) as (AllocationRow & ChargeRow)[];
  return rows.map((r) => ({
    ...hydrateAllocation(r),
    charge: hydrateCharge(r),
  }));
}
