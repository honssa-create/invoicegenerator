import {
  chargeOutstanding,
  isoFromDisplayDate,
  toFormDate,
  type RentRecord,
  type RentalActivityLog,
  type RentalChargeItem,
  type RentalChargeType,
  type RentalLease,
  type RentalLeaseDocument,
  type RentalPaymentReceipt,
  type RentalPaymentWithAllocations,
  type RentalUnit,
  type UnitLeasePaymentLedgerRow,
} from '@/lib/rentals';

export interface RentalUnitDetailPayload {
  unit: RentalUnit;
  currentRecord: RentRecord | null;
  chargeItems?: RentalChargeItem[];
  history: RentRecord[];
  paymentLedger?: UnitLeasePaymentLedgerRow[];
  outstandingCharges?: RentalChargeItem[];
  activities: RentalActivityLog[];
  latestReceipt: RentalPaymentReceipt | null;
  paymentHistory?: RentalPaymentWithAllocations[];
  currentLease?: RentalLease | null;
  viewingLease?: RentalLease | null;
  displayLease?: RentalLease | null;
  readOnlyLease?: boolean;
  isHistoricalView?: boolean;
  leaseHistory?: RentalLease[];
  leaseDocuments?: RentalLeaseDocument[];
  suggestedPrevElectricityReading?: number | null;
  suggestedPrevWaterReading?: number | null;
  portfolioUnits?: { id: number; unitName: string }[];
  sharedMeterDeductionUnits?: { id: number; unitName: string }[];
}

export interface UtilitySnapshot {
  baseRentPeriodFrom: string;
  baseRentPeriodTo: string;
  waterFee: string;
  waterPeriodFrom: string;
  waterPeriodTo: string;
  electricityFee: string;
  electricityPeriodFrom: string;
  electricityPeriodTo: string;
  meterPrevReading: string;
  meterCurrReading: string;
  otherUnitUsages: Record<string, string>;
  meterRatePerUnit: string;
  waterMeterPrev: string;
  waterMeterCurr: string;
  waterMeterRate: string;
  utilityNote: string;
}

export function chargeTypeTotal(
  charges: RentalChargeItem[],
  billingPeriod: string,
  chargeType: RentalChargeType,
): number {
  return charges
    .filter((c) => c.billingPeriod === billingPeriod && c.chargeType === chargeType)
    .reduce((s, c) => s + chargeOutstanding(c), 0);
}

export function formatBreakdownAmount(amount: number): string {
  return amount > 0 ? String(amount) : '';
}

export function periodDateInputProps(
  value: string,
  onChange: (v: string) => void,
  className: string,
  readOnly?: boolean,
) {
  return {
    type: 'date' as const,
    value: isoFromDisplayDate(value) || '',
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(toFormDate(e.target.value)),
    className,
    disabled: readOnly,
    readOnly,
  };
}

export const RENTAL_DETAIL_INPUT_CLS =
  'w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50/40 focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none';
