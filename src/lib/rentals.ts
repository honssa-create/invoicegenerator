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
  const d = Math.min(Math.max(1, day || 1), 28);
  return `每月${d}日`;
}

export function formatUtilityPeriod(from: string | null | undefined, to: string | null | undefined): string {
  if (from && to) return from === to ? from : `${from} – ${to}`;
  if (from) return `from ${from}`;
  if (to) return `to ${to}`;
  return '';
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
  const day = Math.min(Math.max(1, dueDateDay || 1), 28);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
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
