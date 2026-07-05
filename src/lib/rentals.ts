export type RentalStatus = 'pending' | 'paid' | 'overdue';

export const RENTAL_STATUS_LABELS: Record<RentalStatus, string> = {
  pending: '已發租單，待付款 Pending',
  paid: '已交租 Paid',
  overdue: '已過期未交 Overdue',
};

export const RENTAL_STATUS_COLORS: Record<RentalStatus, string> = {
  pending: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  paid: 'bg-green-50 border-green-200 text-green-800',
  overdue: 'bg-red-50 border-red-200 text-red-800',
};

export interface PreviousYearRent {
  year: number;
  rent: number;
}

export interface RentalUnit {
  id: number;
  user_id: number;
  unitName: string;
  tenantName: string;
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
  actualAmount: number;
  status: RentalStatus;
  invoiceRef: string | null;
  receiptRef: string | null;
  invoiceSentAt: string | null;
  receiptSentAt: string | null;
  paidAt: string | null;
  customInvoiceNote: string | null;
  customReceiptNote: string | null;
  created_at: string;
  updated_at: string;
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
