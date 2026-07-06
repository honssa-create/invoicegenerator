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

export const CHARGE_TYPE_LABELS: Record<RentalChargeType, string> = {
  rent: '租金 Rent',
  water: '水費 Water',
  electricity: '電費 Electricity',
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
  unitId: number;
  billingPeriod: string;
  chargeType: RentalChargeType;
  amountDue: number;
  amountAllocated: number;
  legacyRecordId: number | null;
  created_at: string;
  updated_at: string;
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
}

export interface RentPaymentNoticeRow {
  period: string;
  cells: RentPaymentNoticeCell[];
  rowTotal: number;
}

export interface RentPaymentNoticeMatrix {
  tenant: RentalTenant;
  units: Pick<RentalUnit, 'id' | 'unitName'>[];
  period: string;
  fromPeriod: string;
  columns: RentPaymentNoticeColumn[];
  rows: RentPaymentNoticeRow[];
  grandTotal: number;
  totalAllocated: number;
}

export function chargeOutstanding(item: Pick<RentalChargeItem, 'amountDue' | 'amountAllocated'>): number {
  return Math.max(0, (item.amountDue || 0) - (item.amountAllocated || 0));
}
