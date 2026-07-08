export type RentalStatus = 'pending' | 'paid' | 'overdue';
export type RentalDisplayStatus = RentalStatus | 'partial';

export const RENTAL_STATUS_LABELS: Record<RentalDisplayStatus, string> = {
  pending: '待付款 Pending',
  paid: '已付款 Paid',
  overdue: '遲交 Overdue',
  partial: '部分付款 Partial',
};

export const RENTAL_STATUS_BADGE: Record<RentalDisplayStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
  paid: 'bg-green-100 text-green-800 border border-green-200',
  overdue: 'bg-red-100 text-red-800 border border-red-200',
  partial: 'bg-orange-100 text-orange-800 border border-orange-200',
};

// Legacy alias kept for backward-compat in existing card UI
export const RENTAL_STATUS_COLORS = RENTAL_STATUS_BADGE;

export interface PreviousYearRent {
  year: number;
  rent: number;
}

export interface RentalUnit {
  id: number;
  user_id: number;
  unitName: string;
  tenantName: string;
  tenantId: number | null;
  tenantPhone: string;
  tenantEmail: string;
  currentYearRent: number;
  previousYearsRent: PreviousYearRent[];
  leaseStartDate: string;
  leaseEndDate: string;
  dueDateDay: number;
  autoSendReceiptEmail: boolean;
  automationEnabled: boolean;
  utilityBillingMode: UtilityBillingMode;
  /** Honour Label vs Honour Elite debit note company; null = auto from unit name. */
  billingCompany: DebitNoteCompanyId | null;
  address: string;
  created_at: string;
  updated_at: string;
}

export interface RentRecord {
  id: number;
  user_id: number;
  unitId: number;
  billingPeriod: string;
  baseRent: number;
  baseRentPeriodFrom: string | null;
  baseRentPeriodTo: string | null;
  waterFee: number;
  electricityFee: number;
  waterPeriodFrom: string | null;
  waterPeriodTo: string | null;
  electricityPeriodFrom: string | null;
  electricityPeriodTo: string | null;
  actualAmount: number;
  amountPaid: number;
  status: RentalStatus;
  paidDate: string | null;
  invoiceRef: string | null;
  receiptRef: string | null;
  receiptImagePath: string | null;
  invoiceSentAt: string | null;
  receiptSentAt: string | null;
  paidAt: string | null;
  customInvoiceNote: string | null;
  customReceiptNote: string | null;
  electricityMeter: ElectricityMeterData | null;
  waterMeter: WaterMeterData | null;
  created_at: string;
  updated_at: string;
}

export interface RentalPaymentReceipt {
  id: number;
  user_id: number;
  rentRecordId: number;
  imagePath: string;
  extractedMethod: string | null;
  extractedTransferDate: string | null;
  extractedReceivingAccount: string | null;
  extractedAmount: number | null;
  extractionSource: string | null;
  created_at: string;
}

export interface RentalActivityLog {
  id: number;
  user_id: number;
  unitId: number;
  rentRecordId: number | null;
  action: string;
  note: string | null;
  created_at: string;
}

export interface RentalUnitWithRecord extends RentalUnit {
  currentRecord: RentRecord;
  history: RentRecord[];
  currentLease?: RentalLease | null;
  leaseStatus?: LeaseDisplayStatus;
}

// ---------------------------------------------------------------------------
// Lease / contract lifecycle (unit occupancy periods)
// ---------------------------------------------------------------------------

export type LeaseStoredStatus = 'active' | 'ending_soon' | 'ended' | 'terminated' | 'vacant';
export type LeaseDisplayStatus = LeaseStoredStatus;

export const LEASE_STATUS_LABELS: Record<LeaseDisplayStatus, string> = {
  active: '生效中 Active',
  ending_soon: '即將到期 Ending soon',
  ended: '合約完結 Ended',
  terminated: '提早終止 Terminated',
  vacant: '空置 Vacant',
};

export const LEASE_STATUS_BADGE: Record<LeaseDisplayStatus, string> = {
  active: 'bg-green-100 text-green-800 border border-green-200',
  ending_soon: 'bg-amber-100 text-amber-800 border border-amber-200',
  ended: 'bg-gray-100 text-gray-700 border border-gray-200',
  terminated: 'bg-red-100 text-red-800 border border-red-200',
  vacant: 'bg-slate-100 text-slate-600 border border-slate-200',
};

export type LeaseDocumentType = 'agreement' | 'handover' | 'deposit_receipt' | 'other';

export const LEASE_DOC_TYPE_LABELS: Record<LeaseDocumentType, string> = {
  agreement: '租約 Tenancy Agreement',
  handover: '交吉 Handover',
  deposit_receipt: '按金收據 Deposit Receipt',
  other: '其他 Other',
};

export interface RentalLease {
  id: number;
  user_id: number;
  unitId: number;
  tenantId: number | null;
  tenantName: string;
  tenantPhone: string;
  tenantEmail: string;
  leaseStartDate: string;
  leaseEndDate: string;
  actualEndDate: string | null;
  baseRent: number;
  dueDateDay: number;
  depositAmount: number;
  depositRefund: number | null;
  depositDeductions: number;
  status: LeaseStoredStatus;
  endReason: string | null;
  endNotes: string | null;
  autoSendReceiptEmail: boolean;
  automationEnabled: boolean;
  isCurrent: boolean;
  created_at: string;
  updated_at: string;
}

/** Ended lease row for master-panel history table. */
export interface PreviousLeaseRecord {
  leaseId: number;
  unitId: number;
  unitName: string;
  tenantId: number | null;
  tenantName: string;
  leaseStartDate: string;
  leaseEndDate: string;
  actualEndDate: string | null;
  status: LeaseStoredStatus;
  statusLabel: string;
}

/** Official label for completed past tenancies. */
export function pastLeaseStatusLabel(status: LeaseStoredStatus): string {
  if (status === 'terminated') return '提早終止 Terminated';
  return '已完約 Completed';
}

export interface RentalLeaseDocument {
  id: number;
  user_id: number;
  leaseId: number;
  docType: LeaseDocumentType;
  filePath: string;
  label: string | null;
  created_at: string;
}

export interface RentalDashboardAlert {
  type: 'ending_soon' | 'ended_stale' | 'vacant' | 'outstanding_at_end';
  unitId: number;
  unitName: string;
  tenantName: string;
  leaseId?: number;
  message: string;
  daysRemaining?: number | null;
}

export interface BasicRentPeriod {
  periodFrom: string;
  periodTo: string;
  formattedRange: string;
  isoFrom: string;
  isoTo: string;
}

// ---------------------------------------------------------------------------
// Date utilities — strict DD/MM/YYYY for UI / form state / display helpers
// ---------------------------------------------------------------------------

function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

function toIsoDate(year: number, monthIndex0: number, day: number): string {
  return `${year}-${String(monthIndex0 + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Convert Date or ISO / DD/MM/YYYY string → strict DD/MM/YYYY */
export function formatDateToDDMMYYYY(input: Date | string | null | undefined): string {
  if (!input) return '—';
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return '—';
    return `${String(input.getDate()).padStart(2, '0')}/${String(input.getMonth() + 1).padStart(2, '0')}/${input.getFullYear()}`;
  }
  const s = String(input).trim();
  const dm = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dm) {
    return `${dm[1].padStart(2, '0')}/${dm[2].padStart(2, '0')}/${dm[3]}`;
  }
  const datePart = s.slice(0, 10);
  const [y, m, d] = datePart.split('-');
  if (y && m && d && y.length === 4) {
    return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
  }
  return s;
}

/** Parse DD/MM/YYYY (or ISO) → YYYY-MM-DD for DB / comparisons. */
export function isoFromDisplayDate(display: string | null | undefined): string | null {
  if (!display) return null;
  const s = display.trim();
  const dm = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dm) {
    const d = Number(dm[1]);
    const m = Number(dm[2]);
    const y = Number(dm[3]);
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    return toIsoDate(y, m - 1, d);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s.slice(0, 10))) return s.slice(0, 10);
  return null;
}

/** @alias formatDateToDDMMYYYY */
export function formatDisplayDate(iso: string | null | undefined): string {
  return formatDateToDDMMYYYY(iso);
}

/** Add calendar days to an ISO date (YYYY-MM-DD). */
export function addDaysToIsoDate(isoDate: string, days: number): string {
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Formal debit note due date: 發單日期 + 7 days. */
export function debitNoteDueDate(issuedDate: string): string {
  return addDaysToIsoDate(issuedDate, 7);
}

/** @alias formatDateToDDMMYYYY */
export function formatPeriodDate(iso: string): string {
  const f = formatDateToDDMMYYYY(iso);
  return f === '—' ? iso : f;
}

export function formatUtilityPeriod(from: string | null | undefined, to: string | null | undefined): string {
  if (from && to) {
    const f = formatDateToDDMMYYYY(from);
    const t = formatDateToDDMMYYYY(to);
    return f === t ? f : `${f} - ${t}`;
  }
  if (from) return `from ${formatDateToDDMMYYYY(from)}`;
  if (to) return `to ${formatDateToDDMMYYYY(to)}`;
  return '';
}

export function formatRentPeriodRange(from: string, to: string): string {
  return `${formatDateToDDMMYYYY(from)} - ${formatDateToDDMMYYYY(to)}`;
}

/**
 * Calculate basic rent billing period from 每月交租日.
 * - periodFrom: rentPaymentDay of billing month (clamped)
 * - periodTo: one month after periodFrom minus one day
 */
export function calculateBasicRentPeriod(
  rentPaymentDay: number,
  targetYear: number,
  targetMonth: number,
): BasicRentPeriod {
  const day = Math.min(Math.max(1, rentPaymentDay || 1), 31);
  const monthIndex = Math.min(Math.max(0, targetMonth), 11);

  const fromDay = Math.min(day, daysInMonth(targetYear, monthIndex));
  const isoFrom = toIsoDate(targetYear, monthIndex, fromDay);

  let toYear = targetYear;
  let toMonthIndex = monthIndex;
  let toDay: number;

  if (fromDay === 1) {
    toDay = daysInMonth(targetYear, monthIndex);
  } else {
    toMonthIndex = monthIndex + 1;
    if (toMonthIndex > 11) {
      toMonthIndex = 0;
      toYear += 1;
    }
    toDay = Math.min(fromDay - 1, daysInMonth(toYear, toMonthIndex));
  }

  const isoTo = toIsoDate(toYear, toMonthIndex, toDay);
  const periodFrom = formatDateToDDMMYYYY(isoFrom);
  const periodTo = formatDateToDDMMYYYY(isoTo);

  return {
    periodFrom,
    periodTo,
    formattedRange: `${periodFrom} - ${periodTo}`,
    isoFrom,
    isoTo,
  };
}

/** Billing period YYYY-MM + rent payment day → period (ISO for DB + DD/MM/YYYY for UI) */
export function defaultRentPeriod(billingPeriod: string, rentPaymentDay: number): { from: string; to: string } {
  const [year, month] = billingPeriod.split('-').map(Number);
  const { isoFrom, isoTo } = calculateBasicRentPeriod(rentPaymentDay, year, month - 1);
  return { from: isoFrom, to: isoTo };
}

/** @deprecated Use calculateBasicRentPeriod */
export function computeRentPeriod(
  rentPaymentDay: number,
  targetYear: number,
  targetMonth: number,
): { from: string; to: string } {
  const { isoFrom, isoTo } = calculateBasicRentPeriod(rentPaymentDay, targetYear, targetMonth);
  return { from: isoFrom, to: isoTo };
}

// ---------------------------------------------------------------------------
// Rental helpers
// ---------------------------------------------------------------------------

export function currentBillingPeriod(date = new Date()): string {
  return date.toISOString().slice(0, 7);
}

/** Add months to a YYYY-MM billing period. */
export function addBillingMonths(period: string, months: number): string {
  const [y, m] = period.split('-').map(Number);
  if (!y || !m) return period;
  let total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

export function nextBillingPeriod(period: string): string {
  return addBillingMonths(period, 1);
}

export function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-HK', {
    style: 'currency',
    currency: 'HKD',
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export function formatUtilityAmount(value: number): string {
  return value ? formatMoney(value) : '/';
}

export function formatDueDayLabel(day: number): string {
  const d = Math.min(Math.max(1, day || 1), 31);
  return `每月${d}日`;
}

export function baseRentLineLabel(
  record: Pick<RentRecord, 'baseRentPeriodFrom' | 'baseRentPeriodTo' | 'billingPeriod'>
): string {
  const period = formatUtilityPeriod(record.baseRentPeriodFrom, record.baseRentPeriodTo);
  const base = `基本租金 Monthly Rent — ${record.billingPeriod}`;
  return period ? `${base} (${period})` : base;
}

export function utilityLineLabel(
  kind: 'water' | 'electricity',
  record: Pick<RentRecord, 'waterPeriodFrom' | 'waterPeriodTo' | 'electricityPeriodFrom' | 'electricityPeriodTo'>
): string {
  const isWater = kind === 'water';
  const period = formatUtilityPeriod(
    isWater ? record.waterPeriodFrom : record.electricityPeriodFrom,
    isWater ? record.waterPeriodTo : record.electricityPeriodTo,
  );
  const base = isWater ? '水費 Water Fee' : '電費 Electricity Fee';
  return period ? `${base} (${period})` : base;
}

export function daysRemaining(leaseEndDate: string): number | null {
  const iso = isoFromDisplayDate(leaseEndDate) || leaseEndDate;
  if (!iso) return null;
  const end = new Date(`${iso}T23:59:59`);
  if (Number.isNaN(end.getTime())) return null;
  const diff = end.getTime() - Date.now();
  return Math.ceil(diff / 86400000);
}

/** True when billing period YYYY-MM is after the lease end month — block auto-invoice. */
export function billingPeriodAfterLeaseEnd(period: string, leaseEndDate: string | null | undefined): boolean {
  const iso = normalizeStoredDate(leaseEndDate ?? null);
  if (!iso) return false;
  const endMonth = iso.slice(0, 7);
  return period > endMonth;
}

/** True when billing period YYYY-MM falls within lease start/end months (inclusive). */
export function billingPeriodWithinLease(
  period: string,
  leaseStartDate: string | null | undefined,
  leaseEndDate: string | null | undefined,
): boolean {
  const startIso = normalizeStoredDate(leaseStartDate ?? null);
  const endIso = normalizeStoredDate(leaseEndDate ?? null);
  if (!startIso || !endIso) return false;
  const startMonth = startIso.slice(0, 7);
  const endMonth = endIso.slice(0, 7);
  return period >= startMonth && period <= endMonth;
}

/** Replace {{placeholders}} in a template body. */
export function applyTemplatePlaceholders(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? '');
}

const ENDING_SOON_DAYS = 60;

/** Derive display status from lease dates + stored status. */
export function computeLeaseDisplayStatus(
  lease: Pick<RentalLease, 'leaseEndDate' | 'actualEndDate' | 'status' | 'isCurrent'>,
  endingSoonDays = ENDING_SOON_DAYS,
): LeaseDisplayStatus {
  const stored = lease.status;
  if (stored === 'terminated') return 'terminated';
  if (stored === 'ended') return 'ended';
  if (stored === 'vacant' || !lease.isCurrent) return 'vacant';
  const endIso = normalizeStoredDate(lease.actualEndDate || lease.leaseEndDate) || '';
  const today = new Date().toISOString().slice(0, 10);
  if (endIso && today > endIso) return 'ended';
  const days = endIso ? daysRemaining(endIso) : null;
  if (days !== null && days >= 0 && days <= endingSoonDays) return 'ending_soon';
  return stored === 'ending_soon' ? 'ending_soon' : 'active';
}

export function isLeaseBillingActive(
  lease: Pick<RentalLease, 'leaseEndDate' | 'actualEndDate' | 'status' | 'isCurrent' | 'automationEnabled'> | null | undefined,
  period: string,
): boolean {
  if (!lease || !lease.isCurrent) return false;
  const display = computeLeaseDisplayStatus(lease);
  if (display === 'ended' || display === 'terminated' || display === 'vacant') return false;
  if (!lease.automationEnabled) return false;
  const endDate = lease.actualEndDate || lease.leaseEndDate;
  if (billingPeriodAfterLeaseEnd(period, endDate)) return false;
  return true;
}

/** Returns ISO YYYY-MM-DD (for server comparisons). Display via formatDateToDDMMYYYY. */
export function dueDateForPeriod(period: string, dueDateDay: number): string {
  const [year, month] = period.split('-').map(Number);
  const day = Math.min(Math.max(1, dueDateDay || 1), 31);
  const clamped = Math.min(day, daysInMonth(year, month - 1));
  return toIsoDate(year, month - 1, clamped);
}

export function computeTotal(baseRent: number, waterFee: number, electricityFee: number): number {
  return (baseRent || 0) + (waterFee || 0) + (electricityFee || 0);
}

export function outstandingBalance(record: Pick<RentRecord, 'actualAmount' | 'amountPaid'>): number {
  return Math.max(0, (record.actualAmount || 0) - (record.amountPaid || 0));
}

export function displayRentalStatus(record: Pick<RentRecord, 'status' | 'actualAmount' | 'amountPaid'>): RentalDisplayStatus {
  if (record.status === 'paid' || outstandingBalance(record) <= 0) return 'paid';
  if ((record.amountPaid || 0) > 0) return 'partial';
  return record.status;
}

/** Normalize optional date field from API (ISO) → DD/MM/YYYY for form state */
export function toFormDate(value: string | null | undefined): string {
  if (!value) return '';
  return formatDateToDDMMYYYY(value);
}

/** Normalize form DD/MM/YYYY → ISO for API / DB */
export function fromFormDate(value: string | null | undefined): string | null {
  if (!value) return null;
  return isoFromDisplayDate(value);
}

/** Today's date in strict DD/MM/YYYY for form defaults */
export function todayFormDate(): string {
  return formatDateToDDMMYYYY(new Date());
}

/** Normalize DD/MM/YYYY or ISO → ISO for DB storage */
export function normalizeStoredDate(value: string | null | undefined): string | null {
  if (!value) return null;
  return isoFromDisplayDate(value);
}

// ---------------------------------------------------------------------------
// Rental ledger — tenants, charge items, payments, rent payment notice
// ---------------------------------------------------------------------------

export type RentalChargeType = 'rent' | 'water' | 'electricity';

/** Persisted billing-item payment status (maps to rental_charge_items.status). */
export type RentalChargeItemStatus = 'empty' | 'unpaid' | 'partially_paid' | 'paid';

export const CHARGE_TYPE_LABELS: Record<RentalChargeType, string> = {
  rent: '租金 Rent',
  water: '水費 Water',
  electricity: '電費 Electricity',
};

/** Display / debit-note row order: 租金 → 電費 → 水費 */
export const CHARGE_DISPLAY_ORDER: RentalChargeType[] = ['rent', 'electricity', 'water'];

export const CHARGE_SORT: Record<RentalChargeType, number> = {
  rent: 1,
  electricity: 2,
  water: 3,
};

export const CHARGE_STATUS_LABELS: Record<RentalChargeItemStatus, string> = {
  empty: '—',
  unpaid: '未付 Unpaid',
  partially_paid: '部分付款 Partial',
  paid: '已付 Paid',
};

export type UtilityBillingMode = 'tenant_pays' | 'company_proxy';

export const UTILITY_BILLING_MODE_LABELS: Record<UtilityBillingMode, string> = {
  tenant_pays: '租客自行繳付水電費',
  company_proxy: '水電費由公司代交 再向租客收取',
};

/** Fixed portfolio units — seeded per user on first dashboard load. */
export interface DefaultRentalUnitSeed {
  unitName: string;
  utilityBillingMode: UtilityBillingMode;
  tenantName?: string;
}

export const DEFAULT_RENTAL_UNITS: DefaultRentalUnitSeed[] = [
  { unitName: '204', utilityBillingMode: 'tenant_pays' },
  { unitName: '205', utilityBillingMode: 'tenant_pays' },
  { unitName: '213A', utilityBillingMode: 'company_proxy' },
  { unitName: '213B', utilityBillingMode: 'tenant_pays' },
  { unitName: '214', utilityBillingMode: 'tenant_pays' },
  { unitName: 'Stock Room 1', utilityBillingMode: 'company_proxy' },
  { unitName: 'Stock Room 2', utilityBillingMode: 'company_proxy' },
];

export type ElectricityFormula = '213a' | 'stock_room';

export interface ElectricityMeterData {
  prevReading: number | null;
  currReading: number | null;
  /** 213B meter usage (度數) for 213A other-units sum */
  meter213B?: number | null;
  /** Stock Room 1 meter usage (度數) */
  meterStockRoom1?: number | null;
  /** Stock Room 2 meter usage (度數) */
  meterStockRoom2?: number | null;
  /** Total other units usage — auto sum of breakdown fields when present */
  otherUnitsUsage?: number | null;
  ratePerUnit: number | null;
}

export function electricityFormulaForUnit(unitName: string): ElectricityFormula | null {
  const n = unitName.trim().toLowerCase();
  if (n === '213a') return '213a';
  if (n === 'stock room 1' || n === 'stock room 2') return 'stock_room';
  return null;
}

export function parseElectricityMeterJson(raw: string | null | undefined): ElectricityMeterData | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Record<string, unknown>;
    if (!p || typeof p !== 'object') return null;
    const meter: ElectricityMeterData = {
      prevReading: p.prevReading != null ? Number(p.prevReading) : null,
      currReading: p.currReading != null ? Number(p.currReading) : null,
      meter213B: p.meter213B != null ? Number(p.meter213B) : null,
      meterStockRoom1: p.meterStockRoom1 != null ? Number(p.meterStockRoom1) : null,
      meterStockRoom2: p.meterStockRoom2 != null ? Number(p.meterStockRoom2) : null,
      otherUnitsUsage: p.otherUnitsUsage != null ? Number(p.otherUnitsUsage) : null,
      ratePerUnit: p.ratePerUnit != null ? Number(p.ratePerUnit) : null,
    };
    const total = otherUnitsUsageTotal(meter);
    if (total > 0) meter.otherUnitsUsage = total;
    return meter;
  } catch {
    return null;
  }
}

/** Sum 213B + Stock Room 1 + Stock Room 2 meter readings; falls back to stored otherUnitsUsage. */
export function otherUnitsUsageTotal(meter: Pick<ElectricityMeterData, 'meter213B' | 'meterStockRoom1' | 'meterStockRoom2' | 'otherUnitsUsage'>): number {
  const parts: (number | null | undefined)[] = [meter.meter213B, meter.meterStockRoom1, meter.meterStockRoom2];
  const hasBreakdown = parts.some((v) => v != null && Number.isFinite(v));
  if (hasBreakdown) {
    let sum = 0;
    for (const v of parts) {
      if (v != null && Number.isFinite(v)) sum += v;
    }
    return sum;
  }
  return meter.otherUnitsUsage ?? 0;
}

export function electricityUsageUnits(curr: number | null, prev: number | null): number {
  if (curr == null || prev == null || !Number.isFinite(curr) || !Number.isFinite(prev)) return 0;
  return Math.max(0, curr - prev);
}

export function calc213aElectricityFee(meter: ElectricityMeterData): number {
  const usage = electricityUsageUnits(meter.currReading, meter.prevReading);
  const net = Math.max(0, usage - otherUnitsUsageTotal(meter));
  const rate = meter.ratePerUnit ?? 0;
  return Math.round(net * rate * 100) / 100;
}

export function calcStockRoomElectricityFee(meter: ElectricityMeterData): number {
  const usage = electricityUsageUnits(meter.currReading, meter.prevReading);
  const rate = meter.ratePerUnit ?? 0;
  return Math.round(usage * rate * 100) / 100;
}

export function calcElectricityFeeForFormula(formula: ElectricityFormula, meter: ElectricityMeterData): number {
  return formula === '213a' ? calc213aElectricityFee(meter) : calcStockRoomElectricityFee(meter);
}

export function meterDataFromInputs(
  prev: string,
  curr: string,
  rate: string,
  breakdown?: { meter213B?: string; meterStockRoom1?: string; meterStockRoom2?: string },
): ElectricityMeterData {
  const num = (s?: string) => (s !== undefined && s.trim() !== '' ? Number(s) : null);
  const meter: ElectricityMeterData = {
    prevReading: prev.trim() === '' ? null : Number(prev),
    currReading: curr.trim() === '' ? null : Number(curr),
    meter213B: num(breakdown?.meter213B),
    meterStockRoom1: num(breakdown?.meterStockRoom1),
    meterStockRoom2: num(breakdown?.meterStockRoom2),
    ratePerUnit: rate.trim() === '' ? null : Number(rate),
  };
  const total = otherUnitsUsageTotal(meter);
  meter.otherUnitsUsage = total > 0 ? total : null;
  return meter;
}

export interface WaterMeterData {
  prevReading: number | null;
  currReading: number | null;
  ratePerUnit: number | null;
}

export function unitHasWaterMeterFormula(unitName: string): boolean {
  return unitName.trim().toLowerCase() === '213a';
}

export function parseWaterMeterJson(raw: string | null | undefined): WaterMeterData | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Record<string, unknown>;
    if (!p || typeof p !== 'object') return null;
    return {
      prevReading: p.prevReading != null ? Number(p.prevReading) : null,
      currReading: p.currReading != null ? Number(p.currReading) : null,
      ratePerUnit: p.ratePerUnit != null ? Number(p.ratePerUnit) : null,
    };
  } catch {
    return null;
  }
}

export function waterUsageUnits(curr: number | null, prev: number | null): number {
  if (curr == null || prev == null || !Number.isFinite(curr) || !Number.isFinite(prev)) return 0;
  return Math.max(0, curr - prev);
}

export function calcWaterFeeFromMeter(meter: WaterMeterData): number {
  const usage = waterUsageUnits(meter.currReading, meter.prevReading);
  const rate = meter.ratePerUnit ?? 0;
  return Math.round(usage * rate * 100) / 100;
}

export function waterMeterDataFromInputs(prev: string, curr: string, rate: string): WaterMeterData {
  return {
    prevReading: prev.trim() === '' ? null : Number(prev),
    currReading: curr.trim() === '' ? null : Number(curr),
    ratePerUnit: rate.trim() === '' ? null : Number(rate),
  };
}

/** Charge types included on tenant bills / debit notes for this utility mode. */
export function utilityChargeTypesForMode(mode: UtilityBillingMode): RentalChargeType[] {
  return mode === 'company_proxy' ? ['rent', 'water', 'electricity'] : ['rent'];
}

export function tenantBillsUtilities(mode: UtilityBillingMode): boolean {
  return mode === 'company_proxy';
}

/** Unit-level setting with optional tenant fallback (legacy). */
export function resolveUtilityBillingMode(
  unitMode?: UtilityBillingMode | string | null,
  tenantMode?: UtilityBillingMode | string | null,
): UtilityBillingMode {
  if (unitMode === 'tenant_pays' || unitMode === 'company_proxy') return unitMode;
  if (tenantMode === 'tenant_pays' || tenantMode === 'company_proxy') return tenantMode;
  return 'company_proxy';
}

export interface RentalTenant {
  id: number;
  user_id: number;
  name: string;
  phone: string;
  email: string;
  notes: string;
  utilityBillingMode: UtilityBillingMode;
  unitCount?: number;
  created_at: string;
  updated_at: string;
}

export interface RentalChargeItem {
  id: number;
  user_id: number;
  tenantId: number | null;
  unitId: number;
  billingPeriod: string;
  chargeType: RentalChargeType;
  amountDue: number;
  amountAllocated: number;
  status: RentalChargeItemStatus;
  legacyRecordId: number | null;
  created_at: string;
  updated_at: string;
}

/** Payment with itemized allocation breakdown for history tables. */
export interface RentalPaymentWithAllocations extends RentalPayment {
  allocations: RentalPaymentAllocationLine[];
}

export interface RentalPaymentAllocationLine {
  id: number;
  amount: number;
  chargeItemId: number;
  unitId: number;
  unitName: string;
  billingPeriod: string;
  chargeType: RentalChargeType;
}

export interface RentalPayment {
  id: number;
  user_id: number;
  tenantId: number;
  paymentDate: string;
  amount: number;
  receiptImagePath: string | null;
  method: string | null;
  reference: string | null;
  notes: string | null;
  amountAllocated: number;
  amountUnallocated: number;
  created_at: string;
  updated_at: string;
}

export const RENTAL_PAYMENT_METHODS = ['cheque', 'cash', 'bank_transfer', 'autopay'] as const;
export type RentalPaymentMethod = (typeof RENTAL_PAYMENT_METHODS)[number];

export const RENTAL_PAYMENT_METHOD_LABELS: Record<RentalPaymentMethod, string> = {
  cheque: 'Cheque 支票',
  cash: 'Cash 現金',
  bank_transfer: 'Bank Transfer 銀行轉帳',
  autopay: 'Autopay 自動轉帳',
};

export function paymentMethodLabel(method: string | null | undefined): string {
  if (!method) return '—';
  if (method in RENTAL_PAYMENT_METHOD_LABELS) {
    return RENTAL_PAYMENT_METHOD_LABELS[method as RentalPaymentMethod];
  }
  return method;
}

export interface RentalPaymentAllocation {
  id: number;
  user_id: number;
  paymentId: number;
  chargeItemId: number;
  amount: number;
  created_at: string;
}

/** N-to-N payment ↔ billing-item link (maps to rental_payment_allocations). */
export interface RentalPaymentAllocationDetail {
  id: number;
  paymentId: number;
  chargeItemId: number;
  allocatedAmount: number;
  created_at: string;
  paymentDate: string;
  paymentAmount: number;
  paymentMethod: string | null;
  paymentReference: string | null;
  unitId: number;
  unitName: string;
  billingPeriod: string;
  chargeType: RentalChargeType;
  chargeAmountDue: number;
}

export interface RentPaymentNoticeColumn {
  unitId: number;
  unitName: string;
  chargeType: RentalChargeType;
  label: string;
}

export interface RentPaymentNoticeCell {
  chargeItemId: number | null;
  amountDue: number;
  amountAllocated: number;
  outstanding: number;
  status: 'empty' | 'paid' | 'unpaid' | 'partial';
}

export interface RentPaymentNoticeRow {
  period: string;
  periodLabel: string;
  cells: RentPaymentNoticeCell[];
  rowTotal: number;
  isFullyPaid: boolean;
}

export interface RentPaymentNoticeSummary {
  priorArrearsTotal: number;
  priorArrearsPeriods: string[];
  priorPaidTotal: number;
  priorPaidPeriods: string[];
  currentPeriodDue: number;
  currentPeriodOutstanding: number;
  dueDate: string;
  dueDateDisplay: string;
  reminderText: string;
}

export type DebitNoteMode = 'grouped' | 'single';

export interface RentPaymentNoticeMatrix {
  tenant: RentalTenant;
  units: Pick<RentalUnit, 'id' | 'unitName' | 'utilityBillingMode' | 'billingCompany'>[];
  /** Target billing month (YYYY-MM). Alias: targetPeriod. */
  period: string;
  targetPeriod: string;
  fromPeriod: string;
  mode: DebitNoteMode;
  /** Set when mode === 'single'. */
  unitId: number | null;
  columns: RentPaymentNoticeColumn[];
  rows: RentPaymentNoticeRow[];
  summary: RentPaymentNoticeSummary;
  grandTotal: number;
  totalAllocated: number;
  /** Months of fully-paid history included for layout (default 2). */
  paidLookbackMonths: number;
}

export interface RentPaymentNoticeQuery {
  targetPeriod?: string;
  /** Override auto-detected arrears window (optional). */
  fromPeriod?: string;
  /** Include up to N recent fully-paid months before target (default 2). */
  paidLookbackMonths?: number;
  /** grouped = all tenant units; single = one unit only (requires unitId). */
  mode?: DebitNoteMode;
  unitId?: number;
  /** Subset of units for grouped debit note (optional). */
  unitIds?: number[];
  /** Payment instruction template (Honour Label vs Honour Elite). */
  paymentTemplate?: DebitNotePaymentTemplateId;
  /** Extra manual text appended to payment instructions. */
  paymentRemark?: string;
  /** Override generated payment-instruction block (e.g. user-edited on debit note page). */
  paymentInstructionsText?: string;
  /** Override generated footer remark. */
  footerRemark?: string;
}

/** Billing company for debit notes. */
export type DebitNoteCompanyId = 'label' | 'elite';

/** Payment instruction template — maps to billing company. */
export type DebitNotePaymentTemplateId = DebitNoteCompanyId;

export interface DebitNoteCompanyProfile {
  id: DebitNoteCompanyId;
  nameZh: string;
  nameEn: string;
  address: string;
  phone: string;
  taxId: string;
  chequePayee: string;
}

export const DEBIT_NOTE_COMPANY_PROFILES: Record<DebitNoteCompanyId, DebitNoteCompanyProfile> = {
  label: {
    id: 'label',
    nameZh: '鴻宇商標有限公司',
    nameEn: 'HONOUR LABEL LIMITED',
    address: '(公司地址)',
    phone: '(電話)',
    taxId: '(稅務編號)',
    chequePayee: 'Honour Label Limited',
  },
  elite: {
    id: 'elite',
    nameZh: '鴻宇有限公司',
    nameEn: 'HONOUR ELITE LIMITED',
    address: '(公司地址)',
    phone: '(電話)',
    taxId: '(稅務編號)',
    chequePayee: 'Honour Elite Limited',
  },
};

/** Honour Label: 204, 205. Honour Elite: 213A, Stock Rooms, 214. */
export function debitNoteCompanyForUnit(unitName: string): DebitNoteCompanyId {
  const n = unitName.trim().toLowerCase();
  if (n === '204' || n === '205') return 'label';
  if (
    n === '213a' || n === '213b' || n === '214' ||
    n === 'stock room 1' || n === 'stock room 2'
  ) return 'elite';
  return 'label';
}

export function resolveUnitBillingCompany(unit: {
  unitName: string;
  billingCompany?: DebitNoteCompanyId | null;
}): DebitNoteCompanyId {
  if (unit.billingCompany === 'label' || unit.billingCompany === 'elite') {
    return unit.billingCompany;
  }
  return debitNoteCompanyForUnit(unit.unitName);
}

export function resolveDebitNoteCompanyIds(unitNames: string[]): DebitNoteCompanyId[] {
  const ids = new Set(unitNames.map(debitNoteCompanyForUnit));
  const order: DebitNoteCompanyId[] = ['label', 'elite'];
  return order.filter((id) => ids.has(id));
}

export function resolveDebitNoteCompanyIdsFromUnits(
  units: { unitName: string; billingCompany?: DebitNoteCompanyId | null }[],
): DebitNoteCompanyId[] {
  const ids = new Set(units.map(resolveUnitBillingCompany));
  const order: DebitNoteCompanyId[] = ['label', 'elite'];
  return order.filter((id) => ids.has(id));
}

export function defaultPaymentTemplateForUnits(
  units: { unitName: string; billingCompany?: DebitNoteCompanyId | null }[] | string[],
): DebitNotePaymentTemplateId {
  const ids = Array.isArray(units) && units.length && typeof units[0] === 'string'
    ? resolveDebitNoteCompanyIds(units as string[])
    : resolveDebitNoteCompanyIdsFromUnits(units as { unitName: string; billingCompany?: DebitNoteCompanyId | null }[]);
  return ids.length === 1 ? ids[0] : 'label';
}

export const DEBIT_NOTE_COMPANY_CHOICES: { id: DebitNoteCompanyId; label: string }[] = [
  { id: 'label', label: 'Honour Label Limited 鴻宇商標' },
  { id: 'elite', label: 'Honour Elite Limited 鴻宇' },
];

/** Company header block for formal debit notes. */
export interface DebitNoteCompanyInfo {
  nameZh: string;
  nameEn: string;
  address: string;
  phone: string;
  taxId: string;
  chequePayee: string;
  bankAccount: string;
}

export function resolveDebitNoteCompanyHeader(companyIds: DebitNoteCompanyId[]): DebitNoteCompanyInfo {
  if (companyIds.length === 1) {
    const p = DEBIT_NOTE_COMPANY_PROFILES[companyIds[0]];
    return {
      nameZh: p.nameZh,
      nameEn: p.nameEn,
      address: p.address,
      phone: p.phone,
      taxId: p.taxId,
      chequePayee: p.chequePayee,
      bankAccount: companyIds[0] === 'label'
        ? '374-279610-001 · HONOUR LABEL LIMITED · HANG SENG BANK (024)'
        : '(bank transfer details — see payment template)',
    };
  }
  const label = DEBIT_NOTE_COMPANY_PROFILES.label;
  const elite = DEBIT_NOTE_COMPANY_PROFILES.elite;
  return {
    nameZh: `${label.nameZh} / ${elite.nameZh}`,
    nameEn: `${label.nameEn} / ${elite.nameEn}`,
    address: label.address,
    phone: label.phone,
    taxId: label.taxId,
    chequePayee: `${label.chequePayee} / ${elite.chequePayee}`,
    bankAccount: 'See payment instructions below',
  };
}

export const DEFAULT_DEBIT_NOTE_COMPANY: DebitNoteCompanyInfo = resolveDebitNoteCompanyHeader(['label', 'elite']);

/** RM prefix for debit note line items e.g. RM 204 */
export function formatDebitNoteUnitLabel(unitName: string): string {
  const trimmed = unitName.trim();
  if (/^RM\s/i.test(trimmed)) return trimmed;
  return `RM ${trimmed}`;
}

export const DEBIT_NOTE_PAYMENT_TEMPLATE_LABELS: Record<DebitNotePaymentTemplateId, string> = {
  label: 'Template 1 — Honour Label Limited 鴻宇商標',
  elite: 'Template 2 — Honour Elite Limited 鴻宇',
};

/** Build payment-instruction block for debit note footer. */
export function buildDebitNotePaymentInstructionsText(
  templateId: DebitNotePaymentTemplateId,
  noteNo: string,
  dueDateChinese: string,
  manualRemark?: string | null,
  customBody?: string | null,
): string {
  const profile = DEBIT_NOTE_COMPANY_PROFILES[templateId];
  const bankLines = templateId === 'label'
    ? '374-279610-001\nHONOUR LABEL LIMITED\nHANG SENG BANK (bank code : 024)'
    : '-\n\n-';
  const remark = manualRemark?.trim() || '';
  const vars: Record<string, string> = {
    noteNo,
    dueDateChinese,
    chequePayee: profile.chequePayee,
    bankLines,
    manualRemark: remark,
  };
  if (customBody?.trim()) {
    let out = applyTemplatePlaceholders(customBody.trim(), vars);
    if (remark && !customBody.includes('{{manualRemark}}')) {
      out = `${out}\n\n${remark}`;
    }
    return out;
  }
  const lines: string[] = [
    `1. 敬請於到期日 (發單日7日內, ${dueDateChinese}) 或之前繳清上述款項。`,
    '2.',
    'We accept both cheque payment and bank transfer',
    `(Please remark the Note no. ${noteNo} on the cheque or in the bank transfer note.)`,
    '',
    '-',
    '',
    `Crossed cheque made payable to "${profile.chequePayee}"`,
    '',
    '-',
    '',
    'Bank transfer detail:',
    '',
    ...bankLines.split('\n'),
  ];
  if (remark) {
    lines.push('', remark);
  }
  return lines.join('\n');
}

export interface FormalDebitNoteLine {
  unitName: string;
  description: string;
  amount: number;
  /** Used for row ordering (租金 → 電費 → 水費); omitted from print output */
  chargeType: RentalChargeType;
}

export interface FormalDebitNoteArrearRow {
  period: string;
  periodLabel: string;
  details: string;
  amount: number;
}

export interface FormalDebitNote {
  noteNo: string;
  issuedDate: string;
  issuedDateDisplay: string;
  dueDate: string;
  dueDateDisplay: string;
  tenant: RentalTenant;
  premises: string;
  targetPeriod: string;
  targetPeriodLabel: string;
  company: DebitNoteCompanyInfo;
  currentCharges: FormalDebitNoteLine[];
  currentSubtotal: number;
  arrearRows: FormalDebitNoteArrearRow[];
  settledPeriodsNote: string | null;
  totalArrears: number;
  grandTotal: number;
  footerRemark: string;
  paymentInstructions: string[];
  /** Full payment-instruction block (template + optional manual remark). */
  paymentInstructionsText: string;
  paymentTemplateId: DebitNotePaymentTemplateId;
  companyIds: DebitNoteCompanyId[];
  units: Pick<RentalUnit, 'id' | 'unitName' | 'utilityBillingMode' | 'billingCompany'>[];
}

/** Lease row on tenant profile — all units this tenant has occupied. */
export interface TenantLeaseHistoryRow extends RentalLease {
  unitName: string;
}

/** Summary stats for tenant profile header cards. */
export interface TenantProfileSummary {
  activeUnits: number;
  contractCount: number;
  totalPaid: number;
  totalOutstanding: number;
  lastPaymentDate: string | null;
}

/** Per-unit billing row for tenant payment history. */
export interface PeriodPaymentAllocation {
  unitId: number;
  billingPeriod: string;
  /** Total for period — applied rent-first (then water/elec if company proxy). */
  amount?: number;
  rent?: number;
  water?: number;
  electricity?: number;
}

/** Per-unit billing row for tenant payment history. */
export interface TenantBillingHistoryRow {
  recordId: number;
  unitId: number;
  unitName: string;
  billingPeriod: string;
  baseRent: number;
  waterFee: number;
  electricityFee: number;
  actualAmount: number;
  amountPaid: number;
  paidDate: string | null;
  status: RentalDisplayStatus;
}

/** One allocation line applied to a charge item within a billing period. */
export interface PeriodChargeAllocationEntry {
  paymentId: number;
  paymentDate: string;
  amount: number;
  method: string | null;
  reference: string | null;
}

/** Per charge-type breakdown for a lease billing period. */
export interface UnitLeasePeriodChargeDetail {
  chargeType: RentalChargeType;
  amountDue: number;
  amountAllocated: number;
  outstanding: number;
  status: RentalChargeItemStatus;
  allocations: PeriodChargeAllocationEntry[];
}

/** Lease-period payment ledger row (unit profile 租金紀錄). */
export interface UnitLeasePaymentLedgerRow {
  billingPeriod: string;
  recordId: number | null;
  baseRent: number;
  waterFee: number;
  electricityFee: number;
  total: number;
  amountReceived: number;
  receivedDate: string | null;
  status: RentalDisplayStatus;
  invoiceRef: string | null;
  receiptRef: string | null;
  charges: UnitLeasePeriodChargeDetail[];
}

/** Official period status labels for the payment ledger. */
export const PERIOD_LEDGER_STATUS_LABELS: Record<'paid' | 'partial' | 'unpaid', string> = {
  paid: 'Paid 已付',
  partial: 'Partially Paid 部分付款',
  unpaid: 'Unpaid 未付',
};

export function periodLedgerStatusLabel(status: RentalDisplayStatus): string {
  if (status === 'paid') return PERIOD_LEDGER_STATUS_LABELS.paid;
  if (status === 'partial') return PERIOD_LEDGER_STATUS_LABELS.partial;
  return PERIOD_LEDGER_STATUS_LABELS.unpaid;
}

export function periodLedgerStatusBadge(status: RentalDisplayStatus): string {
  if (status === 'paid') return RENTAL_STATUS_BADGE.paid;
  if (status === 'partial') return RENTAL_STATUS_BADGE.partial;
  return RENTAL_STATUS_BADGE.pending;
}

/** Roll up charge-item rows into period Paid / Partially Paid / Unpaid. */
export function derivePeriodPaymentStatus(
  charges: Pick<UnitLeasePeriodChargeDetail, 'amountDue' | 'amountAllocated'>[],
): RentalDisplayStatus {
  const withDue = charges.filter((c) => (c.amountDue || 0) > 0);
  if (!withDue.length) return 'paid';
  const totalDue = withDue.reduce((s, c) => s + c.amountDue, 0);
  const totalAlloc = withDue.reduce((s, c) => s + (c.amountAllocated || 0), 0);
  if (totalAlloc <= 0.009) return 'pending';
  if (totalAlloc >= totalDue - 0.009) return 'paid';
  return 'partial';
}

/** YYYY-MM → 2026年6月份 for debit note line descriptions */
export function formatDebitNotePeriodLong(period: string): string {
  const [y, m] = period.split('-');
  if (!y || !m) return period;
  return `${y}年${Number(m)}月份`;
}

/** Charge line description e.g. 2026年6月份 租金 (Rent) (01/06/2026 - 30/06/2026) or 2026年6月份 電費 (Utilities) (01/06/2026 - 30/06/2026) */
export function formatDebitNoteChargeDescription(
  period: string,
  chargeType: RentalChargeType,
  billingPeriodRange?: { from: string | null; to: string | null },
): string {
  const p = formatDebitNotePeriodLong(period);
  const base =
    chargeType === 'rent'
      ? `${p} 租金 (Rent)`
      : `${p} ${chargeType === 'water' ? '水費 (Utilities)' : '電費 (Utilities)'}`;
  const range = billingPeriodRange ? formatUtilityPeriod(billingPeriodRange.from, billingPeriodRange.to) : '';
  return range ? `${base} (${range})` : base;
}

/** YYYY-MM → MM/YYYY for matrix row labels */
export function formatBillingPeriodLabel(period: string): string {
  const [y, m] = period.split('-');
  if (!y || !m) return period;
  return `${m}/${y}`;
}

/** Short period for reminder text e.g. 02-03/2026 */
export function formatPeriodRangeShort(periods: string[]): string {
  if (!periods.length) return '';
  if (periods.length === 1) return formatBillingPeriodLabel(periods[0]);
  const sorted = [...periods].sort();
  const first = sorted[0].split('-');
  const last = sorted[sorted.length - 1].split('-');
  if (first[0] === last[0]) {
    return `${first[1]}-${last[1]}/${first[0]}`;
  }
  return sorted.map(formatBillingPeriodLabel).join('、');
}

/** Arrear range for footer e.g. 02/2026-03/2026 (min–max unpaid past periods). */
export function formatArrearPeriodRangeLabel(periods: string[]): string {
  if (!periods.length) return '';
  const sorted = [...periods].sort();
  if (sorted.length === 1) return formatBillingPeriodLabel(sorted[0]);
  const first = sorted[0].split('-');
  const last = sorted[sorted.length - 1].split('-');
  if (first[0] === last[0]) {
    return `${formatBillingPeriodLabel(sorted[0])}-${formatBillingPeriodLabel(sorted[sorted.length - 1])}`;
  }
  return sorted.map(formatBillingPeriodLabel).join('、');
}

/** DD/MM/YYYY → 2026年6月28日 */
export function formatDueDateChinese(dueDateDisplay: string, fallbackYear?: string): string {
  const [day, month, year] = dueDateDisplay.split('/');
  if (!day || !month) return dueDateDisplay;
  const yr = year || fallbackYear || '';
  return `${yr}年${Number(month)}月${Number(day)}日`;
}

function formatFooterAmount(grandTotal: number): string {
  return new Intl.NumberFormat('en-HK', {
    style: 'currency',
    currency: 'HKD',
    maximumFractionDigits: 2,
  }).format(grandTotal);
}

/**
 * Debit note footer remark — conditional on historical arrears.
 * A: has arrears → includes 延期 [min-max] 租金/費用及 [current] 應繳款項
 * B: no arrears → clean [current] 應繳款項 only (no 延期)
 */
export function buildDebitNoteFooterRemark(
  targetPeriod: string,
  dueDateDisplay: string,
  priorArrearsPeriods: string[],
  grandTotal: number,
): string {
  if (grandTotal <= 0) return '所有款項已付清 All amounts settled.';

  const dueLabel = formatDueDateChinese(dueDateDisplay, targetPeriod.split('-')[0]);
  const currentLabel = formatBillingPeriodLabel(targetPeriod);
  const amount = formatFooterAmount(grandTotal);
  const arrears = priorArrearsPeriods.filter(Boolean).sort();

  if (arrears.length > 0) {
    const arrearRange = formatArrearPeriodRangeLabel(arrears);
    return `請於 ${dueLabel}前繳交 延期 ${arrearRange} 租金/費用及 ${currentLabel} 應繳款項，總計 ${amount}`;
  }

  return `請於 ${dueLabel}前繳交 ${currentLabel} 應繳款項，總計 ${amount}`;
}

/** Render footer remark from saved template or built-in logic. */
export function renderDebitNoteFooterRemark(
  customTemplate: string | null | undefined,
  targetPeriod: string,
  dueDateDisplay: string,
  priorArrearsPeriods: string[],
  grandTotal: number,
): string {
  if (grandTotal <= 0) return '所有款項已付清 All amounts settled.';

  const dueLabel = formatDueDateChinese(dueDateDisplay, targetPeriod.split('-')[0]);
  const currentLabel = formatBillingPeriodLabel(targetPeriod);
  const amount = formatFooterAmount(grandTotal);
  const arrears = priorArrearsPeriods.filter(Boolean).sort();
  let chargeLabel = `${currentLabel} 應繳款項`;
  if (arrears.length > 0) {
    const arrearRange = formatArrearPeriodRangeLabel(arrears);
    chargeLabel = `延期 ${arrearRange} 租金/費用及 ${currentLabel} 應繳款項`;
  }
  if (customTemplate?.trim()) {
    return applyTemplatePlaceholders(customTemplate.trim(), {
      dueDate: dueLabel,
      periodLabel: currentLabel,
      amount,
      chargeLabel,
      arrearRange: arrears.length ? formatArrearPeriodRangeLabel(arrears) : '',
    });
  }
  return buildDebitNoteFooterRemark(targetPeriod, dueDateDisplay, priorArrearsPeriods, grandTotal);
}

export function chargeOutstanding(item: Pick<RentalChargeItem, 'amountDue' | 'amountAllocated'>): number {
  return Math.max(0, (item.amountDue || 0) - (item.amountAllocated || 0));
}

/** Derive persisted billing-item status from due vs allocated amounts. */
export function deriveChargeItemStatus(
  amountDue: number,
  amountAllocated: number,
): RentalChargeItemStatus {
  if (amountDue <= 0) return 'empty';
  const outstanding = Math.max(0, amountDue - (amountAllocated || 0));
  if (outstanding <= 0.009) return 'paid';
  if ((amountAllocated || 0) > 0) return 'partially_paid';
  return 'unpaid';
}

export function cellPaymentStatus(
  item: Pick<RentalChargeItem, 'amountDue' | 'amountAllocated'> | null
): RentPaymentNoticeCell['status'] {
  if (!item || item.amountDue <= 0) return 'empty';
  const outstanding = chargeOutstanding(item);
  if (outstanding <= 0) return 'paid';
  if ((item.amountAllocated || 0) > 0) return 'partial';
  return 'unpaid';
}
