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

/** Show '/' for zero utility charges; otherwise formatted currency. */
export function formatUtilityAmount(value: number): string {
  return value ? formatMoney(value) : '/';
}

export function formatDueDayLabel(day: number): string {
  const d = Math.min(Math.max(1, day || 1), 31);
  return `每月${d}日`;
}

function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

function toIsoDate(year: number, monthIndex0: number, day: number): string {
  return `${year}-${String(monthIndex0 + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Compute base-rent billing period from 每月交租日.
 * - periodFrom: rentPaymentDay of the billing month (clamped to month length)
 * - periodTo: one month after periodFrom minus one day
 *   (= day rentPaymentDay−1 of the following month, or last day of billing month if day is 1)
 */
export function computeRentPeriod(
  rentPaymentDay: number,
  targetYear: number,
  targetMonth: number,
): { from: string; to: string } {
  const day = Math.min(Math.max(1, rentPaymentDay || 1), 31);
  const monthIndex = Math.min(Math.max(0, targetMonth), 11);

  const fromDay = Math.min(day, daysInMonth(targetYear, monthIndex));
  const from = toIsoDate(targetYear, monthIndex, fromDay);

  let toYear = targetYear;
  let toMonthIndex = monthIndex;
  let toDay: number;

  if (day === 1) {
    toDay = daysInMonth(targetYear, monthIndex);
  } else {
    toMonthIndex = monthIndex + 1;
    if (toMonthIndex > 11) {
      toMonthIndex = 0;
      toYear += 1;
    }
    toDay = Math.min(day - 1, daysInMonth(toYear, toMonthIndex));
  }

  const to = toIsoDate(toYear, toMonthIndex, toDay);
  return { from, to };
}

/** Format rent period as DD/MM/YYYY - DD/MM/YYYY */
export function formatRentPeriodRange(from: string, to: string): string {
  return `${formatPeriodDate(from)} - ${formatPeriodDate(to)}`;
}

/** Billing period YYYY-MM + rent payment day → ISO from/to */
export function defaultRentPeriod(billingPeriod: string, rentPaymentDay: number): { from: string; to: string } {
  const [year, month] = billingPeriod.split('-').map(Number);
  return computeRentPeriod(rentPaymentDay, year, month - 1);
}

export function formatUtilityPeriod(from: string | null | undefined, to: string | null | undefined): string {
  if (from && to) {
    const f = formatPeriodDate(from);
    const t = formatPeriodDate(to);
    return f === t ? f : `${f} – ${t}`;
  }
  if (from) return `from ${formatPeriodDate(from)}`;
  if (to) return `to ${formatPeriodDate(to)}`;
  return '';
}

/** DD/MM/YYYY for invoice display */
export function formatPeriodDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
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
  if (!leaseEndDate) return null;
  const end = new Date(`${leaseEndDate}T23:59:59`);
  if (Number.isNaN(end.getTime())) return null;
  const diff = end.getTime() - Date.now();
  return Math.ceil(diff / 86400000);
}

export function dueDateForPeriod(period: string, dueDateDay: number): string {
  const [year, month] = period.split('-').map(Number);
  const day = Math.min(Math.max(1, dueDateDay || 1), 31);
  const clamped = Math.min(day, daysInMonth(year, month - 1));
  return `${year}-${String(month).padStart(2, '0')}-${String(clamped).padStart(2, '0')}`;
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
