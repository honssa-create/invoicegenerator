import db from './db';
import {
  CHARGE_TYPE_LABELS,
  chargeOutstanding,
  cellPaymentStatus,
  deriveChargeItemStatus,
  dueDateForPeriod,
  formatBillingPeriodLabel,
  formatDisplayDate,
  formatPeriodRangeShort,
  type RentalChargeItem,
  type RentalChargeItemStatus,
  type RentalChargeType,
  type RentalPayment,
  type RentalPaymentAllocation,
  type RentalPaymentAllocationDetail,
  type RentalTenant,
  type RentalUnit,
  type RentPaymentNoticeMatrix,
  type RentPaymentNoticeSummary,
  type RentRecord,
} from './rentals';

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
  created_at: string; updated_at: string;
}

interface ChargeRow {
  id: number; user_id: number; unit_id: number; billing_period: string;
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

function hydrateTenant(row: TenantRow, unitCount = 0): RentalTenant {
  return {
    id: row.id, user_id: row.user_id, name: row.name,
    phone: row.phone || '', email: row.email || '', notes: row.notes || '',
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
    id: row.id, user_id: row.user_id, unitId: row.unit_id,
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

export function getTenantUnits(tenantId: number, userId: number): Pick<RentalUnit, 'id' | 'unitName' | 'tenantName'>[] {
  return (db.prepare(
    'SELECT id, unit_name, tenant_name FROM rental_units WHERE tenant_id = ? AND user_id = ? ORDER BY unit_name COLLATE NOCASE'
  ).all(tenantId, userId) as { id: number; unit_name: string; tenant_name: string }[]).map((r) => ({
    id: r.id, unitName: r.unit_name, tenantName: r.tenant_name,
  }));
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
  period: string,
  fromPeriod?: string,
): RentPaymentNoticeMatrix | null {
  const tenantId = getTenantIdForUnit(unitId, userId);
  if (!tenantId) return null;
  return buildRentPaymentNoticeMatrix(tenantId, userId, period, fromPeriod);
}

// ---------------------------------------------------------------------------
// Charge item sync from legacy rental_records (parallel run)
// ---------------------------------------------------------------------------

const CHARGE_ORDER: RentalChargeType[] = ['rent', 'water', 'electricity'];

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
  const charges: [RentalChargeType, number][] = [
    ['rent', record.baseRent || 0],
    ['water', record.waterFee || 0],
    ['electricity', record.electricityFee || 0],
  ];
  const upsert = db.prepare(
    `INSERT INTO rental_charge_items (user_id, unit_id, billing_period, charge_type, amount_due, amount_allocated, legacy_record_id)
     VALUES (?, ?, ?, ?, ?, 0, ?)
     ON CONFLICT(user_id, unit_id, billing_period, charge_type) DO UPDATE SET
       amount_due = excluded.amount_due,
       legacy_record_id = excluded.legacy_record_id,
       updated_at = datetime('now')`
  );
  const itemIds: { id: number; due: number }[] = [];
  for (const [type, due] of charges) {
    upsert.run(record.user_id, record.unitId, record.billingPeriod, type, due, record.id);
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

function buildReminderText(
  period: string,
  dueDateDisplay: string,
  priorArrearsPeriods: string[],
  grandTotal: number,
): string {
  if (grandTotal <= 0) return '所有款項已付清 All amounts settled.';
  const [y, m] = period.split('-').map(Number);
  const yy = String(y).slice(-2);
  const parts: string[] = [];
  if (priorArrearsPeriods.length) {
    parts.push(`延期${formatPeriodRangeShort(priorArrearsPeriods)}租金`);
  }
  parts.push(formatBillingPeriodLabel(period));
  const amount = new Intl.NumberFormat('en-HK', { style: 'currency', currency: 'HKD', maximumFractionDigits: 2 }).format(grandTotal);
  return `${yy}年${m}月${dueDateDisplay.split('/')[0]}日前必須應繳交 ${parts.join('、')} ${amount}`;
}

export function buildRentPaymentNoticeMatrix(
  tenantId: number | string,
  userId: number,
  period: string,
  fromPeriod?: string,
): RentPaymentNoticeMatrix | null {
  const tenant = getRentalTenant(tenantId, userId);
  if (!tenant) return null;

  const units = getTenantUnits(tenant.id, userId);
  const emptySummary: RentPaymentNoticeSummary = {
    priorArrearsTotal: 0, priorArrearsPeriods: [], priorPaidTotal: 0, priorPaidPeriods: [],
    currentPeriodDue: 0, currentPeriodOutstanding: 0,
    dueDate: dueDateForPeriod(period, 1), dueDateDisplay: formatDisplayDate(dueDateForPeriod(period, 1)),
    reminderText: '',
  };

  if (!units.length) {
    return {
      tenant, units, period, fromPeriod: fromPeriod || period,
      columns: [], rows: [], summary: emptySummary, grandTotal: 0, totalAllocated: 0,
    };
  }

  const unitIds = units.map((u) => u.id);
  const placeholders = unitIds.map(() => '?').join(',');
  const charges = (db.prepare(
    `SELECT * FROM rental_charge_items
     WHERE user_id = ? AND unit_id IN (${placeholders})`
  ).all(userId, ...unitIds) as ChargeRow[]).map(hydrateCharge);

  const unitMeta = db.prepare(
    `SELECT due_date_day FROM rental_units WHERE tenant_id = ? AND user_id = ? LIMIT 1`
  ).get(tenantId, userId) as { due_date_day: number } | undefined;
  const dueDateDay = unitMeta?.due_date_day || 1;
  const dueDate = dueDateForPeriod(period, dueDateDay);
  const dueDateDisplay = formatDisplayDate(dueDate);

  const from = fromPeriod || period;
  const basePeriods = new Set<string>();

  for (const c of charges) {
    if (c.amountDue > 0 || c.amountAllocated > 0) basePeriods.add(c.billingPeriod);
    if (chargeOutstanding(c) > 0) basePeriods.add(c.billingPeriod);
  }
  for (const p of periodRange(from, period)) basePeriods.add(p);

  const periods = Array.from(basePeriods).filter((p) => p <= period).sort();
  const columns = units.flatMap((unit) =>
    CHARGE_ORDER.map((chargeType) => ({
      unitId: unit.id,
      unitName: unit.unitName,
      chargeType,
      label: columnLabel(unit.unitName, chargeType),
    }))
  );

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

    if (p < period) {
      if (rowTotal > 0) {
        priorArrearsTotal += rowTotal;
        if (!priorArrearsPeriods.includes(p)) priorArrearsPeriods.push(p);
      } else if (rowDue > 0) {
        priorPaidTotal += rowDue;
        if (!priorPaidPeriods.includes(p)) priorPaidPeriods.push(p);
      }
    } else if (p === period) {
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
    reminderText: buildReminderText(period, dueDateDisplay, priorArrearsPeriods, grandTotal),
  };

  return {
    tenant, units, period, fromPeriod: from, columns, rows, summary, grandTotal, totalAllocated,
  };
}

// ---------------------------------------------------------------------------
// Tenant detail — charges, payments, allocations
// ---------------------------------------------------------------------------

export function getTenantLedgerDetail(tenantId: number | string, userId: number) {
  const tenant = getRentalTenant(tenantId, userId);
  if (!tenant) return null;
  const units = getTenantUnits(tenant.id, userId);
  const unitIds = units.map((u) => u.id);

  let outstandingCharges: RentalChargeItem[] = [];
  if (unitIds.length) {
    const placeholders = unitIds.map(() => '?').join(',');
    outstandingCharges = (db.prepare(
      `SELECT * FROM rental_charge_items
       WHERE user_id = ? AND unit_id IN (${placeholders})
         AND amount_due > amount_allocated
       ORDER BY billing_period ASC, unit_id ASC, charge_type ASC`
    ).all(userId, ...unitIds) as ChargeRow[]).map(hydrateCharge);
  }

  const payments = (db.prepare(
    'SELECT * FROM rental_payments WHERE tenant_id = ? AND user_id = ? ORDER BY payment_date DESC, id DESC'
  ).all(tenantId, userId) as PaymentRow[]).map(hydratePayment);

  const allocationLedger = getTenantAllocationLedger(tenant.id, userId);

  return { tenant, units, outstandingCharges, payments, allocationLedger };
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

  syncLegacyRecordFromCharges(allocations.map((a) => a.chargeItemId), userId);

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

function syncLegacyRecordFromCharges(chargeItemIds: number[], userId: number) {
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
    db.prepare(
      `UPDATE rental_records SET amount_paid = ?, status = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`
    ).run(totalPaid, fullyPaid ? 'paid' : 'pending', recordId, userId);
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
