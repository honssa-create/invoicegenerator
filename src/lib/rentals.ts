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

export const CHARGE_STATUS_LABELS: Record<RentalChargeItemStatus, string> = {
  empty: '—',
  unpaid: '未付 Unpaid',
  partially_paid: '部分付款 Partial',
  paid: '已付 Paid',
};

export interface RentalTenant {
  id: number;
  user_id: number;
  name: string;
  phone: string;
  email: string;
  notes: string;
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
  units: Pick<RentalUnit, 'id' | 'unitName'>[];
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
}

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

export const DEFAULT_DEBIT_NOTE_COMPANY: DebitNoteCompanyInfo = {
  nameZh: '鴻宇商標有限公司 / 鴻宇有限公司',
  nameEn: 'HONOUR LABEL LIMITED / HONOUR ELITE LIMITED',
  address: '(公司地址)',
  phone: '(電話)',
  taxId: '(稅務編號)',
  chequePayee: '鴻宇商標有限公司',
  bankAccount: '匯豐銀行 004-xxx-xxxxxx',
};

export interface FormalDebitNoteLine {
  unitName: string;
  description: string;
  amount: number;
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
  units: Pick<RentalUnit, 'id' | 'unitName'>[];
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

/** YYYY-MM → 2026年6月份 for debit note line descriptions */
export function formatDebitNotePeriodLong(period: string): string {
  const [y, m] = period.split('-');
  if (!y || !m) return period;
  return `${y}年${Number(m)}月份`;
}

/** Charge line description e.g. 2026年6月份 租金 (Rent) */
export function formatDebitNoteChargeDescription(period: string, chargeType: RentalChargeType): string {
  const p = formatDebitNotePeriodLong(period);
  if (chargeType === 'rent') return `${p} 租金 (Rent)`;
  if (chargeType === 'water') return `${p} 水費 (Utilities)`;
  return `${p} 電費 (Utilities)`;
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
