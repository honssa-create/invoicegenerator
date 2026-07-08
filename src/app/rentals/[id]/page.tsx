'use client';

import { useCallback, useEffect, useRef, useState, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import DebitNoteActions from '@/components/DebitNoteActions';
import DebitNotePaymentOptions from '@/components/DebitNotePaymentOptions';
import UtilityBillingPicker from '@/components/UtilityBillingPicker';
import ElectricityMeterCalculator from '@/components/ElectricityMeterCalculator';
import WaterMeterCalculator from '@/components/WaterMeterCalculator';
import LeaseStatusBadge from '@/components/LeaseStatusBadge';
import PaymentHistoryTable from '@/components/PaymentHistoryTable';
import RentalPaymentLedgerTable from '@/components/RentalPaymentLedgerTable';
import ChargeAllocationGrid, {
  chargeRowsByType,
  distributeByChargeType,
  fillOutstandingValues,
  fillRentOnlyValues,
  sumAllocationValues,
} from '@/components/ChargeAllocationGrid';
import { compressImage } from '@/lib/imageCompression';
import {
  RENTAL_STATUS_BADGE,
  RENTAL_STATUS_LABELS,
  RENTAL_PAYMENT_METHODS,
  RENTAL_PAYMENT_METHOD_LABELS,
  addBillingMonths,
  calculateBasicRentPeriod,
  chargeOutstanding,
  computeLeaseDisplayStatus,
  currentBillingPeriod,
  daysRemaining,
  displayRentalStatus,
  formatDueDayLabel,
  formatDisplayDate,
  formatMoney,
  formatUtilityAmount,
  baseRentLineLabel,
  fromFormDate,
  isoFromDisplayDate,
  outstandingBalance,
  toFormDate,
  todayFormDate,
  utilityLineLabel,
  calcElectricityFeeForFormula,
  calcWaterFeeFromMeter,
  debitNoteCompanyForUnit,
  electricityFormulaForUnit,
  formatBillingPeriodLabel,
  meterDataFromInputs,
  pastLeaseStatusLabel,
  unitHasWaterMeterFormula,
  waterMeterDataFromInputs,
  type DebitNotePaymentTemplateId,
  type RentRecord,
  type RentalActivityLog,
  type RentalChargeItem,
  type RentalChargeType,
  type RentalLease,
  type RentalLeaseDocument,
  type RentalPaymentReceipt,
  type RentalPaymentWithAllocations,
  type RentalUnit,
  type RentalUnitWithRecord,
  type UnitLeasePaymentLedgerRow,
  type UtilityBillingMode,
} from '@/lib/rentals';

interface DetailPayload {
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
}

interface UtilitySnapshot {
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
  meter213B: string;
  meterStockRoom1: string;
  meterStockRoom2: string;
  meterRatePerUnit: string;
  waterMeterPrev: string;
  waterMeterCurr: string;
  waterMeterRate: string;
  utilityNote: string;
}

type PeriodBreakdownRow = {
  billingPeriod: string;
  rent: string;
  electricity: string;
  water: string;
};

function sumPeriodBreakdownRow(row: PeriodBreakdownRow): number {
  return Number(row.rent || 0) + Number(row.electricity || 0) + Number(row.water || 0);
}

function sumPeriodBreakdownRows(rows: PeriodBreakdownRow[]): number {
  return rows.reduce((s, r) => s + sumPeriodBreakdownRow(r), 0);
}

function chargeTypeTotal(
  charges: RentalChargeItem[],
  billingPeriod: string,
  chargeType: RentalChargeType,
): number {
  return charges
    .filter((c) => c.billingPeriod === billingPeriod && c.chargeType === chargeType)
    .reduce((s, c) => s + chargeOutstanding(c), 0);
}

function formatBreakdownAmount(amount: number): string {
  return amount > 0 ? String(amount) : '';
}

function periodDateInputProps(
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

export default function RentalDetailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" /></div>}>
      <RentalDetailInner />
    </Suspense>
  );
}

function RentalDetailInner() {
  const params = useParams();
  const router = useRouter();
  const sp = useSearchParams();
  const id = params.id as string;
  const viewLeaseId = sp.get('leaseId');

  const [period, setPeriod] = useState(sp.get('period') || currentBillingPeriod());
  const [data, setData] = useState<DetailPayload | null>(null);
  const [loading, setLoading] = useState(true);

  // profile inputs
  const [tenantName, setTenantName] = useState('');
  const [tenantPhone, setTenantPhone] = useState('');
  const [tenantEmail, setTenantEmail] = useState('');
  const [dueDateDay, setDueDateDay] = useState('1');
  const [baseRent, setBaseRent] = useState('');
  const [utilityBillingMode, setUtilityBillingMode] = useState<UtilityBillingMode>('company_proxy');
  const [leaseStartDate, setLeaseStartDate] = useState('');
  const [leaseEndDate, setLeaseEndDate] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [unitAddress, setUnitAddress] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);

  // utility inputs
  const [baseRentPeriodFrom, setBaseRentPeriodFrom] = useState('');
  const [baseRentPeriodTo, setBaseRentPeriodTo] = useState('');
  const [waterFee, setWaterFee] = useState('');
  const [waterPeriodFrom, setWaterPeriodFrom] = useState('');
  const [waterPeriodTo, setWaterPeriodTo] = useState('');
  const [electricityFee, setElectricityFee] = useState('');
  const [electricityPeriodFrom, setElectricityPeriodFrom] = useState('');
  const [electricityPeriodTo, setElectricityPeriodTo] = useState('');
  const [meterPrevReading, setMeterPrevReading] = useState('');
  const [meterCurrReading, setMeterCurrReading] = useState('');
  const [meter213B, setMeter213B] = useState('');
  const [meterStockRoom1, setMeterStockRoom1] = useState('');
  const [meterStockRoom2, setMeterStockRoom2] = useState('');
  const [meterRatePerUnit, setMeterRatePerUnit] = useState('');
  const [waterMeterPrev, setWaterMeterPrev] = useState('');
  const [waterMeterCurr, setWaterMeterCurr] = useState('');
  const [waterMeterRate, setWaterMeterRate] = useState('');
  const [suggestedPrevReading, setSuggestedPrevReading] = useState<number | null>(null);
  const [suggestedPrevWaterReading, setSuggestedPrevWaterReading] = useState<number | null>(null);
  const [utilityNote, setUtilityNote] = useState('');
  const [utilitySaveState, setUtilitySaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [utilityCanUndo, setUtilityCanUndo] = useState(false);
  const skipUtilityAutoSaveRef = useRef(true);
  const utilitySaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCommittedUtilityRef = useRef<UtilitySnapshot | null>(null);
  const undoUtilitySnapshotRef = useRef<UtilitySnapshot | null>(null);
  const skipUndoCaptureRef = useRef(false);

  // invoice modal
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoiceNote, setInvoiceNote] = useState('');
  const [invoicePaymentTemplate, setInvoicePaymentTemplate] = useState<DebitNotePaymentTemplateId>('label');
  const [invoicePaymentRemark, setInvoicePaymentRemark] = useState('');

  // paid modal
  const [showPaidModal, setShowPaidModal] = useState(false);
  const [paymentMode, setPaymentMode] = useState<'byPeriod' | 'byType'>('byPeriod');
  const [periodRows, setPeriodRows] = useState<PeriodBreakdownRow[]>([]);
  const [paymentForm, setPaymentForm] = useState({
    paymentDate: todayFormDate(),
    amount: '',
    method: '',
    reference: '',
    notes: '',
  });
  const [autoSendReceipt, setAutoSendReceipt] = useState(false);
  const [chargeAllocValues, setChargeAllocValues] = useState<Record<string, string>>({});
  const [paidNote, setPaidNote] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [ocrResult, setOcrResult] = useState<{ extracted: { amount: number | null; method: string | null; transfer_date: string | null; receiving_account: string | null }; matched: boolean } | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const skipPeriodRecalcRef = useRef(true);

  const billingYearMonth = () => {
    const [year, month] = period.split('-').map(Number);
    return { year, monthIndex: month - 1 };
  };

  const calcBasicRentPeriod = (rentPaymentDay: number) => {
    const { year, monthIndex } = billingYearMonth();
    return calculateBasicRentPeriod(rentPaymentDay, year, monthIndex);
  };

  // activity note modal
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteText, setNoteText] = useState('');

  // end contract modal
  const [showEndContractModal, setShowEndContractModal] = useState(false);
  const [endContractForm, setEndContractForm] = useState({
    actualEndDate: todayFormDate(),
    depositRefund: '',
    depositDeductions: '',
    endNotes: '',
    startNew: false,
    newTenantName: '',
    newLeaseStart: todayFormDate(),
    newLeaseEnd: '',
    newBaseRent: '',
  });
  const [leaseDocUploading, setLeaseDocUploading] = useState(false);
  const leaseDocInputRef = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState(false);
  const [deletingPaymentId, setDeletingPaymentId] = useState<number | null>(null);
  const [toast, setToast] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setUtilityCanUndo(false);
    skipPeriodRecalcRef.current = true;
    skipUtilityAutoSaveRef.current = true;
    fetch(`/api/rentals/units/${id}?period=${period}${viewLeaseId ? `&leaseId=${viewLeaseId}` : ''}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setData(d);
          const profileLease = d.displayLease as RentalLease | null | undefined;
          const useLease = d.isHistoricalView && profileLease;
          setTenantName(useLease ? profileLease.tenantName : (d.unit.tenantName || ''));
          setTenantPhone(useLease ? profileLease.tenantPhone : (d.unit.tenantPhone || ''));
          setTenantEmail(useLease ? profileLease.tenantEmail : (d.unit.tenantEmail || ''));
          setDueDateDay(String(useLease ? profileLease.dueDateDay : (d.unit.dueDateDay || 1)));
          setBaseRent(String(useLease ? profileLease.baseRent : (d.currentRecord?.baseRent ?? d.unit.currentYearRent ?? 0)));
          setUtilityBillingMode(d.unit.utilityBillingMode || 'company_proxy');
          setLeaseStartDate(useLease
            ? toFormDate(profileLease.leaseStartDate)
            : (d.unit.leaseStartDate ? toFormDate(d.unit.leaseStartDate) : ''));
          setLeaseEndDate(useLease
            ? toFormDate(profileLease.actualEndDate || profileLease.leaseEndDate)
            : (d.unit.leaseEndDate ? toFormDate(d.unit.leaseEndDate) : ''));
          setDepositAmount(
            (useLease ? profileLease.depositAmount : d.currentLease?.depositAmount) != null
              ? String(useLease ? profileLease.depositAmount : d.currentLease.depositAmount)
              : '',
          );
          setUnitAddress(d.unit.address || '');
          const rec = d.currentRecord;
          if (rec) {
            const calc = calcBasicRentPeriod(Number(d.unit.dueDateDay) || 1);
            setBaseRentPeriodFrom(rec.baseRentPeriodFrom ? toFormDate(rec.baseRentPeriodFrom) : calc.periodFrom);
            setBaseRentPeriodTo(rec.baseRentPeriodTo ? toFormDate(rec.baseRentPeriodTo) : calc.periodTo);
            setWaterFee(String(rec.waterFee || 0));
            setWaterPeriodFrom(toFormDate(rec.waterPeriodFrom));
            setWaterPeriodTo(toFormDate(rec.waterPeriodTo));
            setElectricityFee(String(rec.electricityFee || 0));
            setElectricityPeriodFrom(toFormDate(rec.electricityPeriodFrom));
            setElectricityPeriodTo(toFormDate(rec.electricityPeriodTo));
            const meter = rec.electricityMeter;
            setMeterPrevReading(meter?.prevReading != null ? String(meter.prevReading) : '');
            setMeterCurrReading(meter?.currReading != null ? String(meter.currReading) : '');
            setMeter213B(meter?.meter213B != null ? String(meter.meter213B) : '');
            setMeterStockRoom1(meter?.meterStockRoom1 != null ? String(meter.meterStockRoom1) : '');
            setMeterStockRoom2(meter?.meterStockRoom2 != null ? String(meter.meterStockRoom2) : '');
            setMeterRatePerUnit(meter?.ratePerUnit != null ? String(meter.ratePerUnit) : '');
            setSuggestedPrevReading(d.suggestedPrevElectricityReading ?? null);
            setSuggestedPrevWaterReading(d.suggestedPrevWaterReading ?? null);
            const waterMeter = rec.waterMeter;
            setWaterMeterPrev(waterMeter?.prevReading != null ? String(waterMeter.prevReading) : '');
            setWaterMeterCurr(waterMeter?.currReading != null ? String(waterMeter.currReading) : '');
            setWaterMeterRate(waterMeter?.ratePerUnit != null ? String(waterMeter.ratePerUnit) : '');
            if (!waterMeter?.prevReading && d.suggestedPrevWaterReading != null) {
              setWaterMeterPrev(String(d.suggestedPrevWaterReading));
            }
            if (!meter?.prevReading && d.suggestedPrevElectricityReading != null) {
              setMeterPrevReading(String(d.suggestedPrevElectricityReading));
            }
            setUtilityNote(rec.customInvoiceNote || '');
            setAutoSendReceipt(d.unit.autoSendReceiptEmail);
            lastCommittedUtilityRef.current = {
              baseRentPeriodFrom: rec.baseRentPeriodFrom ? toFormDate(rec.baseRentPeriodFrom) : calc.periodFrom,
              baseRentPeriodTo: rec.baseRentPeriodTo ? toFormDate(rec.baseRentPeriodTo) : calc.periodTo,
              waterFee: String(rec.waterFee || 0),
              waterPeriodFrom: toFormDate(rec.waterPeriodFrom),
              waterPeriodTo: toFormDate(rec.waterPeriodTo),
              electricityFee: String(rec.electricityFee || 0),
              electricityPeriodFrom: toFormDate(rec.electricityPeriodFrom),
              electricityPeriodTo: toFormDate(rec.electricityPeriodTo),
              meterPrevReading: meter?.prevReading != null ? String(meter.prevReading) : (d.suggestedPrevElectricityReading != null ? String(d.suggestedPrevElectricityReading) : ''),
              meterCurrReading: meter?.currReading != null ? String(meter.currReading) : '',
              meter213B: meter?.meter213B != null ? String(meter.meter213B) : '',
              meterStockRoom1: meter?.meterStockRoom1 != null ? String(meter.meterStockRoom1) : '',
              meterStockRoom2: meter?.meterStockRoom2 != null ? String(meter.meterStockRoom2) : '',
              meterRatePerUnit: meter?.ratePerUnit != null ? String(meter.ratePerUnit) : '',
              waterMeterPrev: waterMeter?.prevReading != null ? String(waterMeter.prevReading) : (d.suggestedPrevWaterReading != null ? String(d.suggestedPrevWaterReading) : ''),
              waterMeterCurr: waterMeter?.currReading != null ? String(waterMeter.currReading) : '',
              waterMeterRate: waterMeter?.ratePerUnit != null ? String(waterMeter.ratePerUnit) : '',
              utilityNote: rec.customInvoiceNote || '',
            };
            undoUtilitySnapshotRef.current = null;
          }
        }
      })
      .finally(() => {
        skipPeriodRecalcRef.current = false;
        setLoading(false);
        setTimeout(() => { skipUtilityAutoSaveRef.current = false; }, 200);
      });
  }, [id, period, viewLeaseId]);

  useEffect(() => { load(); }, [load]);

  // Reactive base-rent period: recalc whenever 每月交租日 or billing month changes
  useEffect(() => {
    if (skipPeriodRecalcRef.current) return;
    const calc = calcBasicRentPeriod(Number(dueDateDay) || 1);
    setBaseRentPeriodFrom(calc.periodFrom);
    setBaseRentPeriodTo(calc.periodTo);
  }, [dueDateDay, period]);

  const electricityFormula = data?.unit ? electricityFormulaForUnit(data.unit.unitName) : null;
  const waterMeterFormula = data?.unit ? unitHasWaterMeterFormula(data.unit.unitName) : false;

  useEffect(() => {
    if (!waterMeterFormula) return;
    const meter = waterMeterDataFromInputs(waterMeterPrev, waterMeterCurr, waterMeterRate);
    const fee = calcWaterFeeFromMeter(meter);
    setWaterFee(fee > 0 || meter.currReading != null ? String(fee) : '');
  }, [waterMeterFormula, waterMeterPrev, waterMeterCurr, waterMeterRate]);

  useEffect(() => {
    if (!electricityFormula) return;
    const meter = meterDataFromInputs(meterPrevReading, meterCurrReading, meterRatePerUnit, {
      meter213B, meterStockRoom1, meterStockRoom2,
    });
    const fee = calcElectricityFeeForFormula(electricityFormula, meter);
    const hasInput = [meterPrevReading, meterCurrReading, meterRatePerUnit].some((v) => v.trim() !== '');
    setElectricityFee(hasInput ? String(fee) : '');
  }, [electricityFormula, meterPrevReading, meterCurrReading, meter213B, meterStockRoom1, meterStockRoom2, meterRatePerUnit]);

  const inp = 'w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50/40 focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none';

  const captureUtilitySnapshot = useCallback((): UtilitySnapshot => ({
    baseRentPeriodFrom,
    baseRentPeriodTo,
    waterFee,
    waterPeriodFrom,
    waterPeriodTo,
    electricityFee,
    electricityPeriodFrom,
    electricityPeriodTo,
    meterPrevReading,
    meterCurrReading,
    meter213B,
    meterStockRoom1,
    meterStockRoom2,
    meterRatePerUnit,
    waterMeterPrev,
    waterMeterCurr,
    waterMeterRate,
    utilityNote,
  }), [
    baseRentPeriodFrom, baseRentPeriodTo, waterFee, waterPeriodFrom, waterPeriodTo,
    electricityFee, electricityPeriodFrom, electricityPeriodTo,
    meterPrevReading, meterCurrReading, meter213B, meterStockRoom1, meterStockRoom2, meterRatePerUnit,
    waterMeterPrev, waterMeterCurr, waterMeterRate, utilityNote,
  ]);

  const applyUtilitySnapshot = useCallback((snap: UtilitySnapshot) => {
    setBaseRentPeriodFrom(snap.baseRentPeriodFrom);
    setBaseRentPeriodTo(snap.baseRentPeriodTo);
    setWaterFee(snap.waterFee);
    setWaterPeriodFrom(snap.waterPeriodFrom);
    setWaterPeriodTo(snap.waterPeriodTo);
    setElectricityFee(snap.electricityFee);
    setElectricityPeriodFrom(snap.electricityPeriodFrom);
    setElectricityPeriodTo(snap.electricityPeriodTo);
    setMeterPrevReading(snap.meterPrevReading);
    setMeterCurrReading(snap.meterCurrReading);
    setMeter213B(snap.meter213B);
    setMeterStockRoom1(snap.meterStockRoom1);
    setMeterStockRoom2(snap.meterStockRoom2);
    setMeterRatePerUnit(snap.meterRatePerUnit);
    setWaterMeterPrev(snap.waterMeterPrev);
    setWaterMeterCurr(snap.waterMeterCurr);
    setWaterMeterRate(snap.waterMeterRate);
    setUtilityNote(snap.utilityNote);
  }, []);

  const buildUtilityPayload = useCallback((snap?: UtilitySnapshot) => {
    const s = snap ?? captureUtilitySnapshot();
    const payload: Record<string, unknown> = {
      baseRentPeriodFrom: fromFormDate(s.baseRentPeriodFrom),
      baseRentPeriodTo: fromFormDate(s.baseRentPeriodTo),
      waterFee: Number(s.waterFee),
      electricityFee: Number(s.electricityFee),
      waterPeriodFrom: fromFormDate(s.waterPeriodFrom),
      waterPeriodTo: fromFormDate(s.waterPeriodTo),
      electricityPeriodFrom: fromFormDate(s.electricityPeriodFrom),
      electricityPeriodTo: fromFormDate(s.electricityPeriodTo),
      customInvoiceNote: s.utilityNote || null,
    };
    if (electricityFormula) {
      payload.electricityMeter = meterDataFromInputs(
        s.meterPrevReading, s.meterCurrReading, s.meterRatePerUnit,
        { meter213B: s.meter213B, meterStockRoom1: s.meterStockRoom1, meterStockRoom2: s.meterStockRoom2 },
      );
    }
    if (waterMeterFormula) {
      payload.waterMeter = waterMeterDataFromInputs(s.waterMeterPrev, s.waterMeterCurr, s.waterMeterRate);
    }
    return payload;
  }, [captureUtilitySnapshot, electricityFormula, waterMeterFormula]);

  const saveUtilities = useCallback(async (opts?: { reload?: boolean; snapshot?: UtilitySnapshot; skipUndo?: boolean }) => {
    const recordId = data?.currentRecord?.id;
    if (!recordId) return false;
    if (!opts?.skipUndo && !skipUndoCaptureRef.current && lastCommittedUtilityRef.current) {
      undoUtilitySnapshotRef.current = lastCommittedUtilityRef.current;
      setUtilityCanUndo(true);
    }
    setUtilitySaveState('saving');
    const res = await fetch(`/api/rentals/records/${recordId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildUtilityPayload(opts?.snapshot)),
    });
    skipUndoCaptureRef.current = false;
    if (!res.ok) {
      setUtilitySaveState('error');
      return false;
    }
    const { record } = await res.json();
    setData((prev) => (prev ? { ...prev, currentRecord: record } : prev));
    lastCommittedUtilityRef.current = opts?.snapshot ?? captureUtilitySnapshot();
    setUtilitySaveState('saved');
    if (opts?.reload) load();
    else window.setTimeout(() => setUtilitySaveState('idle'), 2000);
    return true;
  }, [data?.currentRecord?.id, buildUtilityPayload, captureUtilitySnapshot, load]);

  const undoUtilitySave = useCallback(async () => {
    const snap = undoUtilitySnapshotRef.current;
    if (!snap) return;
    setUtilityCanUndo(false);
    undoUtilitySnapshotRef.current = null;
    skipUndoCaptureRef.current = true;
    skipUtilityAutoSaveRef.current = true;
    applyUtilitySnapshot(snap);
    await saveUtilities({ snapshot: snap, skipUndo: true });
    window.setTimeout(() => { skipUtilityAutoSaveRef.current = false; }, 200);
  }, [applyUtilitySnapshot, saveUtilities]);

  useEffect(() => {
    if (skipUtilityAutoSaveRef.current || !data?.currentRecord || data.readOnlyLease) return;
    if (utilitySaveTimerRef.current) clearTimeout(utilitySaveTimerRef.current);
    utilitySaveTimerRef.current = setTimeout(() => {
      void saveUtilities();
    }, 600);
    return () => {
      if (utilitySaveTimerRef.current) clearTimeout(utilitySaveTimerRef.current);
    };
  }, [
    data?.currentRecord?.id,
    saveUtilities,
    baseRentPeriodFrom, baseRentPeriodTo,
    waterFee, waterPeriodFrom, waterPeriodTo,
    electricityFee, electricityPeriodFrom, electricityPeriodTo,
    meterPrevReading, meterCurrReading, meter213B, meterStockRoom1, meterStockRoom2, meterRatePerUnit,
    waterMeterPrev, waterMeterCurr, waterMeterRate,
    utilityNote,
  ]);

  const saveProfile = async () => {
    if (data?.readOnlyLease) return;
    setProfileSaving(true);
    await fetch(`/api/rentals/units/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantName: tenantName.trim(),
        tenantPhone: tenantPhone.trim(),
        tenantEmail: tenantEmail.trim(),
        dueDateDay: Number(dueDateDay) || 1,
        currentYearRent: Number(baseRent) || 0,
        utilityBillingMode,
        leaseStartDate: fromFormDate(leaseStartDate),
        leaseEndDate: fromFormDate(leaseEndDate),
        depositAmount: Number(depositAmount) || 0,
        address: unitAddress.trim(),
      }),
    });
    setProfileSaving(false);
    setToast('Profile saved');
    load();
  };

  const sendInvoice = async () => {
    if (!data?.currentRecord) return;
    setBusy(true);
    const res = await fetch(`/api/rentals/records/${data.currentRecord.id}/invoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...buildUtilityPayload(),
        note: invoiceNote || null,
        paymentTemplate: invoicePaymentTemplate,
        paymentRemark: invoicePaymentRemark || null,
      }),
    });
    setBusy(false);
    setToast(res.ok ? 'Invoice sent!' : 'Failed to send invoice');
    setShowInvoiceModal(false);
    load();
  };

  const handleReceiptUpload = async (file: File) => {
    setOcrResult(null);
    setOcrLoading(true);
    let f = file;
    try {
      const c = await compressImage(file, { maxDim: 1600, targetBytes: 300 * 1024, mimeType: 'image/jpeg', quality: 0.65 });
      f = c.file;
    } catch { /* use original */ }
    setReceiptFile(f);

    if (!data?.currentRecord) { setOcrLoading(false); return; }
    const fd = new FormData();
    fd.append('receipt', f);
    const res = await fetch(`/api/rentals/records/${data.currentRecord.id}/receipt-scan`, { method: 'POST', body: fd });
    const d = await res.json();
    setOcrLoading(false);
    if (res.ok) {
      setOcrResult({ extracted: d.extracted, matched: d.matched });
      if (d.extracted?.transfer_date) {
        setPaymentForm((f) => ({ ...f, paymentDate: toFormDate(d.extracted.transfer_date) }));
      }
      if (d.extracted?.amount) {
        setPaymentForm((f) => ({ ...f, amount: String(d.extracted.amount) }));
      }
    }
  };

  const openPaidModal = () => {
    if (!data?.unit.tenantId || data.readOnlyLease || data.isHistoricalView) return;
    const outstanding = data.outstandingCharges || [];
    const rows = chargeRowsByType(outstanding);
    const filled = fillOutstandingValues(rows);
    setChargeAllocValues(filled);
    setPaymentMode('byPeriod');
    setPeriodRows([]);
    setPaymentForm({
      paymentDate: todayFormDate(),
      amount: String(sumAllocationValues(filled) || ''),
      method: '',
      reference: '',
      notes: '',
    });
    setPaidNote('');
    setShowPaidModal(true);
    setOcrResult(null);
    setReceiptFile(null);
  };

  const startPaymentPeriod = () => {
    if (!data) return currentBillingPeriod();
    const periods = (data.outstandingCharges || [])
      .filter((c) => chargeOutstanding(c) > 0)
      .map((c) => c.billingPeriod)
      .sort();
    return periods[0] || period;
  };

  const monthlyRentForUnit = () => {
    if (data?.unit.currentYearRent) return data.unit.currentYearRent;
    const hist = data?.paymentLedger?.find((h) => h.baseRent > 0);
    return hist?.baseRent || Number(baseRent) || 0;
  };

  const fillOutstandingPeriodRows = () => {
    if (!data) return;
    const seen = new Set<string>();
    const rows: PeriodBreakdownRow[] = [];
    const charges = [...(data.outstandingCharges || [])]
      .filter((c) => chargeOutstanding(c) > 0)
      .sort((a, b) => a.billingPeriod.localeCompare(b.billingPeriod));
    for (const c of charges) {
      if (seen.has(c.billingPeriod)) continue;
      seen.add(c.billingPeriod);
      rows.push({
        billingPeriod: c.billingPeriod,
        rent: formatBreakdownAmount(chargeTypeTotal(charges, c.billingPeriod, 'rent')),
        electricity: formatBreakdownAmount(chargeTypeTotal(charges, c.billingPeriod, 'electricity')),
        water: formatBreakdownAmount(chargeTypeTotal(charges, c.billingPeriod, 'water')),
      });
    }
    setPeriodRows(rows);
    setPaymentForm((f) => ({ ...f, amount: String(sumPeriodBreakdownRows(rows)) }));
  };

  const fillAdvanceMonths = (months: number) => {
    if (!data) return;
    const rows: PeriodBreakdownRow[] = [];
    let p = startPaymentPeriod();
    const rent = monthlyRentForUnit();
    for (let i = 0; i < months; i += 1) {
      rows.push({
        billingPeriod: p,
        rent: rent ? String(rent) : '',
        electricity: '',
        water: '',
      });
      p = addBillingMonths(p, 1);
    }
    setPeriodRows(rows);
    setPaymentForm((f) => ({ ...f, amount: String(sumPeriodBreakdownRows(rows)) }));
  };

  const addPeriodRow = () => {
    setPeriodRows((prev) => [...prev, { billingPeriod: startPaymentPeriod(), rent: '', electricity: '', water: '' }]);
  };

  const updatePeriodRow = (idx: number, patch: Partial<PeriodBreakdownRow>) => {
    setPeriodRows((prev) => {
      const next = prev.map((r, i) => (i === idx ? { ...r, ...patch } : r));
      setPaymentForm((f) => ({ ...f, amount: String(sumPeriodBreakdownRows(next)) }));
      return next;
    });
  };

  const chargeTypeRows = data ? chargeRowsByType(data.outstandingCharges || []) : [];

  const confirmPaid = async () => {
    if (!data?.unit.tenantId) return;
    const amount = Number(paymentForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setToast('Enter a valid payment amount 請輸入有效收款金額');
      return;
    }

    let body: Record<string, unknown> = {
      tenantId: data.unit.tenantId,
      paymentDate: fromFormDate(paymentForm.paymentDate),
      amount,
      method: paymentForm.method || null,
      reference: paymentForm.reference || null,
      notes: paidNote || paymentForm.notes || null,
      unitIds: [data.unit.id],
    };

    if (paymentMode === 'byPeriod') {
      const periodAllocations = periodRows
        .filter((r) => r.billingPeriod && sumPeriodBreakdownRow(r) > 0)
        .map((r) => ({
          unitId: data.unit.id,
          billingPeriod: r.billingPeriod,
          rent: Number(r.rent) || undefined,
          electricity: Number(r.electricity) || undefined,
          water: Number(r.water) || undefined,
        }));
      if (periodAllocations.length) {
        body.periodAllocations = periodAllocations;
      } else {
        body.autoAllocate = true;
      }
    } else {
      const allocSum = sumAllocationValues(chargeAllocValues);
      if (allocSum > amount + 0.01) {
        setToast('Allocated total exceeds payment amount 分配金額超過收款總額');
        return;
      }
      const allocations = distributeByChargeType(data.outstandingCharges || [], chargeAllocValues);
      if (allocations.length && Math.abs(allocSum - amount) < 0.02) {
        body.allocations = allocations;
      } else if (allocations.length && allocSum < amount) {
        body.autoAllocate = true;
      } else if (allocations.length) {
        body.allocations = allocations;
      } else {
        body.autoAllocate = true;
      }
    }

    setBusy(true);
    const res = await fetch('/api/rentals/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setBusy(false);
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      setToast(d.error || 'Failed to record payment');
      return;
    }
    setToast('Payment recorded — outstanding balance updated 收款已記錄');
    setShowPaidModal(false);
    setChargeAllocValues({});
    setPeriodRows([]);
    setPaymentForm({ paymentDate: todayFormDate(), amount: '', method: '', reference: '', notes: '' });
    setOcrResult(null);
    setReceiptFile(null);
    load();
  };

  const handleDeletePayment = async (paymentId: number) => {
    if (!confirm('Delete this payment? Allocations will be reversed and billing records updated.\n刪除此收款紀錄？已核銷金額將還原至帳單。')) return;
    setDeletingPaymentId(paymentId);
    try {
      const res = await fetch(`/api/rentals/payments/${paymentId}`, { method: 'DELETE' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToast(d.error || 'Failed to delete payment');
        return;
      }
      setToast('Payment deleted — records updated 收款已刪除');
      load();
    } catch {
      setToast('Failed to delete payment');
    } finally {
      setDeletingPaymentId(null);
    }
  };

  const logNote = async () => {
    if (!noteText.trim()) return;
    setBusy(true);
    await fetch(`/api/rentals/units/${id}/activities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'Note Added', note: noteText }),
    });
    setBusy(false);
    setShowNoteModal(false);
    setNoteText('');
    load();
  };

  const submitEndContract = async () => {
    setBusy(true);
    const body: Record<string, unknown> = {
      actualEndDate: fromFormDate(endContractForm.actualEndDate),
      depositRefund: endContractForm.depositRefund ? Number(endContractForm.depositRefund) : undefined,
      depositDeductions: endContractForm.depositDeductions ? Number(endContractForm.depositDeductions) : undefined,
      endNotes: endContractForm.endNotes || undefined,
      forceEnd: true,
    };
    if (endContractForm.startNew && endContractForm.newTenantName.trim()) {
      body.startNewLease = {
        tenantName: endContractForm.newTenantName.trim(),
        leaseStartDate: fromFormDate(endContractForm.newLeaseStart),
        leaseEndDate: fromFormDate(endContractForm.newLeaseEnd),
        baseRent: Number(endContractForm.newBaseRent) || Number(baseRent) || 0,
        dueDateDay: Number(dueDateDay) || 1,
      };
    }
    const res = await fetch(`/api/rentals/units/${id}/end-contract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json();
      setToast(d.error || 'Failed to end contract');
      return;
    }
    setShowEndContractModal(false);
    setToast(endContractForm.startNew ? 'Contract ended — new lease started' : 'Contract ended');
    load();
  };

  const uploadLeaseDoc = async (file: File) => {
    const leaseId = data?.currentLease?.id;
    if (!leaseId) return;
    setLeaseDocUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('docType', 'agreement');
    const res = await fetch(`/api/rentals/leases/${leaseId}/documents`, { method: 'POST', body: fd });
    setLeaseDocUploading(false);
    setToast(res.ok ? 'Document uploaded' : 'Upload failed');
    load();
  };

  if (loading) return <AppLayout><div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" /></div></AppLayout>;
  if (!data) return <AppLayout><div className="p-12 text-center text-gray-500">Unit not found. <button onClick={() => router.push('/rentals')} className="text-brand-600 underline">Back</button></div></AppLayout>;

  const { unit, currentRecord, activities, currentLease, leaseHistory, leaseDocuments, paymentLedger, viewingLease, readOnlyLease, isHistoricalView } = data;
  const rec = currentRecord;
  const remaining = daysRemaining(unit.leaseEndDate);
  const recStatus = rec ? displayRentalStatus(rec) : 'pending';
  const balance = rec ? outstandingBalance(rec) : 0;
  const readOnly = Boolean(readOnlyLease);
  const fieldCls = readOnly
    ? 'w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-100 text-gray-600 cursor-not-allowed'
    : inp;
  const leaseStatus = isHistoricalView && viewingLease
    ? computeLeaseDisplayStatus(viewingLease)
    : currentLease
      ? computeLeaseDisplayStatus(currentLease)
      : unit.tenantName?.trim() && unit.tenantName !== 'Vacant 空置' ? 'active' : 'vacant';
  const contractEnded = readOnly || leaseStatus === 'ended' || leaseStatus === 'terminated';
  const autoRentPeriod = calcBasicRentPeriod(Number(dueDateDay) || 1);
  const previousTenants = (leaseHistory || []).filter((l) => !l.isCurrent);
  const liveElectricityMeter = meterDataFromInputs(meterPrevReading, meterCurrReading, meterRatePerUnit, {
    meter213B, meterStockRoom1, meterStockRoom2,
  });
  const liveElectricityFee = electricityFormula
    ? calcElectricityFeeForFormula(electricityFormula, liveElectricityMeter)
    : Number(electricityFee) || rec?.electricityFee || 0;
  const liveWaterFee = waterMeterFormula
    ? calcWaterFeeFromMeter(waterMeterDataFromInputs(waterMeterPrev, waterMeterCurr, waterMeterRate))
    : Number(waterFee) || rec?.waterFee || 0;
  const liveMonthTotal = (Number(baseRent) || rec?.baseRent || 0) + liveWaterFee + liveElectricityFee;

  return (
    <AppLayout>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-3">
        <button onClick={() => router.push('/rentals')} className="text-sm text-brand-600 font-medium min-h-[44px] sm:min-h-0 text-left">← Back to Rentals</button>
        <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className={`${inp} w-full sm:w-auto`} />
      </div>

      {toast && <div onClick={() => setToast('')} className="mb-4 p-3 bg-brand-50 text-brand-700 text-sm rounded-lg cursor-pointer">{toast} ✕</div>}

      {isHistoricalView && viewingLease && (
        <div className="mb-4 rounded-xl border border-gray-300 bg-gray-50 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-gray-800">歷任租客紀錄 · Read-only 只供查閱</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {viewingLease.tenantName} · {formatDisplayDate(viewingLease.leaseStartDate)} → {formatDisplayDate(viewingLease.actualEndDate || viewingLease.leaseEndDate)}
            </p>
          </div>
          <Link
            href={`/rentals/${unit.id}?period=${period}`}
            className="text-sm text-brand-600 font-medium hover:underline"
          >
            ← Back to current unit 返回現任租約
          </Link>
        </div>
      )}

      {readOnly && !isHistoricalView && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Contract ended — profile is locked. Use <strong>完約 End Contract</strong> to archive and start a new tenancy.
        </div>
      )}

      {/* Header — editable profile */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
        <div className="flex items-start justify-between flex-wrap gap-4 mb-5">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-brand-600 font-semibold">
              {isHistoricalView ? 'Historical Tenant Record 歷任租客' : 'Unit Profile 單位資料'}
            </p>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">{unit.unitName}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {!isHistoricalView && (
                <span className="inline-flex items-center rounded-lg bg-brand-50 border border-brand-200 px-3 py-1.5 text-sm font-medium text-brand-800">
                  帳期 Billing: {formatBillingPeriodLabel(period)}
                </span>
              )}
              <LeaseStatusBadge status={leaseStatus} />
              {readOnly && (
                <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200">
                  只供查閱 View only
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              租期 Rental period: {formatDisplayDate(unit.leaseStartDate) || '—'} → {formatDisplayDate(unit.leaseEndDate) || '—'}
              {remaining !== null && (
                <span className={`ml-2 font-semibold ${remaining < 60 ? 'text-red-600' : 'text-gray-600'}`}>
                  · {remaining} days remaining
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!contractEnded && !isHistoricalView && (
              <button
                type="button"
                onClick={() => {
                  setEndContractForm((f) => ({
                    ...f,
                    actualEndDate: todayFormDate(),
                    newTenantName: '',
                    newLeaseEnd: '',
                    newBaseRent: String(unit.currentYearRent || ''),
                  }));
                  setShowEndContractModal(true);
                }}
                className="px-3 py-2 text-sm border border-red-200 text-red-700 rounded-lg hover:bg-red-50"
              >
                完約 End Contract
              </button>
            )}
            {unit.tenantId && !isHistoricalView && !readOnly ? (
              <>
                <Link
                  href={`/rentals/tenants/${unit.tenantId}`}
                  className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Tenant Ledger 租客
                </Link>
                <DebitNoteActions
                  tenantId={unit.tenantId}
                  unitId={unit.id}
                  unitName={unit.unitName}
                  period={period}
                />
              </>
            ) : !readOnly && !isHistoricalView ? (
              <p className="text-xs text-amber-600 self-center">Save tenant name to enable rent payment notice</p>
            ) : null}
          </div>
        </div>
        <div className={`grid md:grid-cols-2 lg:grid-cols-3 gap-4 ${readOnly ? 'opacity-90' : ''}`}>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Tenant Name 租單位人士</label>
            <input className={fieldCls} value={tenantName} onChange={(e) => setTenantName(e.target.value)} disabled={readOnly} readOnly={readOnly} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Phone 電話</label>
            <input type="tel" className={fieldCls} value={tenantPhone} onChange={(e) => setTenantPhone(e.target.value)} placeholder="+852…" disabled={readOnly} readOnly={readOnly} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
            <input type="email" className={fieldCls} value={tenantEmail} onChange={(e) => setTenantEmail(e.target.value)} placeholder="tenant@email.com" disabled={readOnly} readOnly={readOnly} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">每月交租日 Due Day (1–31)</label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500 whitespace-nowrap">每月</span>
              <input type="number" min={1} max={31} className={`${fieldCls} w-20 text-center`} value={dueDateDay} onChange={(e) => setDueDateDay(e.target.value)} disabled={readOnly} readOnly={readOnly} />
              <span className="text-sm text-gray-500 whitespace-nowrap">日</span>
              <span className="text-sm font-medium text-brand-700 ml-1">{formatDueDayLabel(Number(dueDateDay) || 1)}</span>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">基本租金 Base Rent / month</label>
            <input type="number" min={0} className={fieldCls} value={baseRent} onChange={(e) => setBaseRent(e.target.value)} disabled={readOnly} readOnly={readOnly} />
            <p className="text-xs text-gray-400 mt-1">
              Fixed for lease period 起租日–完租日; applies to all months in the lease.
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">已交按金 Deposit Paid</label>
            <input type="number" min={0} className={fieldCls} value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} placeholder="0" disabled={readOnly} readOnly={readOnly} />
          </div>
          <div className="md:col-span-2 lg:col-span-3">
            <label className="block text-xs font-medium text-gray-500 mb-1">地址 Address</label>
            <textarea
              className={`${fieldCls} min-h-[72px] resize-y`}
              value={unitAddress}
              onChange={(e) => setUnitAddress(e.target.value)}
              placeholder="Unit / mailing address 單位地址"
              rows={2}
              disabled={readOnly}
              readOnly={readOnly}
            />
          </div>
          <div className="md:col-span-2 lg:col-span-2">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">起租日 Lease Start 租期</label>
                <input type="text" inputMode="numeric" placeholder="DD/MM/YYYY" className={fieldCls} value={leaseStartDate} onChange={(e) => setLeaseStartDate(e.target.value)} disabled={readOnly} readOnly={readOnly} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">完租日 Lease End 租期</label>
                <input type="text" inputMode="numeric" placeholder="DD/MM/YYYY" className={fieldCls} value={leaseEndDate} onChange={(e) => setLeaseEndDate(e.target.value)} disabled={readOnly} readOnly={readOnly} />
              </div>
            </div>
          </div>
        </div>
        {!readOnly && (
        <div className="mt-6 pt-5 border-t border-gray-100">
          <label className="block text-xs font-medium text-gray-500 mb-2">水電費安排 Utility Billing</label>
          <p className="text-xs text-gray-400 mb-3">Controls whether water &amp; electricity appear on debit notes for this unit</p>
          <UtilityBillingPicker
            value={utilityBillingMode}
            onChange={setUtilityBillingMode}
          />
        </div>
        )}
        {!readOnly && (
        <div className="mt-4 flex justify-end">
          <button onClick={saveProfile} disabled={profileSaving} className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
            {profileSaving ? 'Saving…' : 'Save Profile 儲存資料'}
          </button>
        </div>
        )}
      </div>

      <div className="grid lg:grid-cols-[1fr_340px] gap-6 lg:items-start">
        {/* LEFT */}
        <div className="space-y-6">
          {/* Utility / billing for current month */}
          {!isHistoricalView && (
          <div className={`bg-white rounded-2xl border border-gray-200 p-6 ${readOnly ? 'opacity-90' : ''}`}>
            <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
              <div>
                <p className="text-[11px] uppercase tracking-widest text-brand-600 font-semibold">水電費紀錄與帳單</p>
                <h2 className="text-lg font-semibold text-gray-900">Utilities & Billing — {period}</h2>
              </div>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              {readOnly ? 'Contract ended — billing locked 合約已完結，不可編輯' : 'Changes auto-save as you type. Use Undo 復原 if you made a mistake.'}
            </p>
            {rec ? (
              <>
                {/* Base Rent */}
                <div className="rounded-xl border border-brand-100 bg-brand-50/40 p-4 mb-4">
                  <p className="text-sm font-semibold text-brand-800 mb-3">基本租金 Base Rent</p>
                  <div className="grid md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Amount 金額</label>
                      <div className="px-3 py-2.5 rounded-lg bg-white border border-gray-200 text-sm font-semibold">{formatMoney(Number(baseRent) || rec.baseRent)}</div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Period From 計費起始</label>
                      <input {...periodDateInputProps(baseRentPeriodFrom, setBaseRentPeriodFrom, fieldCls, readOnly)} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Period To 計費結束</label>
                      <input {...periodDateInputProps(baseRentPeriodTo, setBaseRentPeriodTo, fieldCls, readOnly)} />
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    Amount locked to lease base rent · Auto ({formatDueDayLabel(Number(dueDateDay) || 1)}): {autoRentPeriod.formattedRange}
                  </p>
                </div>

                {/* Electricity */}
                <div className="rounded-xl border border-yellow-100 bg-yellow-50/40 p-4 mb-4">
                  <p className="text-sm font-semibold text-yellow-800 mb-3">電費 Electricity Fee</p>
                  {electricityFormula ? (
                    <>
                      <p className="text-xs text-yellow-700/80 mb-3">
                        {electricityFormula === '213a'
                          ? '213A formula: 實用電度數 = (今次 − 前次) − 其他單位；AMOUNT = 實用電度數 × 每度電費'
                          : 'Stock Room formula: 用電度數 = 今次錶數 − 前次錶數；AMOUNT = 用電度數 × 每度電費'}
                      </p>
                      <div className="grid md:grid-cols-3 gap-3 mb-4">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Amount 金額</label>
                          <div className="px-3 py-2.5 rounded-lg bg-white border border-yellow-200 text-sm font-semibold text-yellow-900">
                            {formatMoney(liveElectricityFee)}
                          </div>
                        </div>
                      </div>
                      <ElectricityMeterCalculator
                        formula={electricityFormula}
                        prevReading={meterPrevReading}
                        currReading={meterCurrReading}
                        meter213B={meter213B}
                        meterStockRoom1={meterStockRoom1}
                        meterStockRoom2={meterStockRoom2}
                        ratePerUnit={meterRatePerUnit}
                        onPrevReading={setMeterPrevReading}
                        onCurrReading={setMeterCurrReading}
                        onMeter213B={setMeter213B}
                        onMeterStockRoom1={setMeterStockRoom1}
                        onMeterStockRoom2={setMeterStockRoom2}
                        onRatePerUnit={setMeterRatePerUnit}
                        suggestedPrevReading={suggestedPrevReading}
                        inpClassName={fieldCls}
                        readOnly={readOnly}
                      />
                      <div className="grid md:grid-cols-2 gap-3 mt-4">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Period From 計費起始</label>
                          <input {...periodDateInputProps(electricityPeriodFrom, setElectricityPeriodFrom, inp, readOnly)} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Period To 計費結束</label>
                          <input {...periodDateInputProps(electricityPeriodTo, setElectricityPeriodTo, inp, readOnly)} />
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="grid md:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Amount 金額</label>
                        <input type="number" min={0} value={electricityFee} onChange={(e) => setElectricityFee(e.target.value)} className={inp} placeholder="0 → shows /" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Period From 計費起始</label>
                        <input {...periodDateInputProps(electricityPeriodFrom, setElectricityPeriodFrom, inp, readOnly)} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Period To 計費結束</label>
                        <input {...periodDateInputProps(electricityPeriodTo, setElectricityPeriodTo, inp, readOnly)} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Water */}
                <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4 mb-4">
                  <p className="text-sm font-semibold text-blue-800 mb-3">水費 Water Fee</p>
                  {waterMeterFormula ? (
                    <>
                      <p className="text-xs text-blue-700/80 mb-3">213A formula: 用水度數 = 今次錶數 − 前次錶數</p>
                      <WaterMeterCalculator
                        prevReading={waterMeterPrev}
                        currReading={waterMeterCurr}
                        ratePerUnit={waterMeterRate}
                        onPrevReading={setWaterMeterPrev}
                        onCurrReading={setWaterMeterCurr}
                        onRatePerUnit={setWaterMeterRate}
                        suggestedPrevReading={suggestedPrevWaterReading}
                        inpClassName={fieldCls}
                        readOnly={readOnly}
                      />
                      <div className="grid md:grid-cols-2 gap-3 mt-4">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Period From 計費起始</label>
                          <input {...periodDateInputProps(waterPeriodFrom, setWaterPeriodFrom, inp, readOnly)} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Period To 計費結束</label>
                          <input {...periodDateInputProps(waterPeriodTo, setWaterPeriodTo, inp, readOnly)} />
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="grid md:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Amount 金額</label>
                        <input type="number" min={0} value={waterFee} onChange={(e) => setWaterFee(e.target.value)} className={inp} placeholder="0 → shows /" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Period From 計費起始</label>
                        <input {...periodDateInputProps(waterPeriodFrom, setWaterPeriodFrom, inp, readOnly)} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Period To 計費結束</label>
                        <input {...periodDateInputProps(waterPeriodTo, setWaterPeriodTo, inp, readOnly)} />
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex items-end gap-4">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Invoice Note (optional)</label>
                    <input className={inp} value={utilityNote} onChange={(e) => setUtilityNote(e.target.value)} placeholder="e.g. Water meter 1234" />
                  </div>
                  <div className="flex flex-col items-end gap-1 pb-2.5 min-w-[5.5rem]">
                    <p className="text-xs text-gray-500 whitespace-nowrap text-right">
                      {utilitySaveState === 'saving' && 'Saving… 儲存中'}
                      {utilitySaveState === 'saved' && <span className="text-green-600">Saved ✓ 已儲存</span>}
                      {utilitySaveState === 'error' && <span className="text-red-600">Save failed</span>}
                    </p>
                    {utilityCanUndo && (
                      <button
                        type="button"
                        onClick={() => void undoUtilitySave()}
                        className="text-xs text-brand-600 font-medium hover:underline"
                      >
                        Undo 復原
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-4 rounded-xl border-2 border-brand-100 bg-brand-50 p-4 flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <p className="text-xs text-gray-500">Total this month</p>
                    <p className="text-3xl font-bold text-brand-700">{formatMoney(liveMonthTotal)}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Rent {formatMoney(Number(baseRent) || rec.baseRent)} + Water {formatUtilityAmount(liveWaterFee)} + Elec {formatUtilityAmount(liveElectricityFee)}
                    </p>
                    {rec.amountPaid > 0 && (
                      <p className="text-sm text-green-700 mt-2 font-medium">
                        Paid {formatMoney(rec.amountPaid)}
                        {balance > 0 && <span className="text-orange-700"> · Outstanding {formatMoney(balance)}</span>}
                      </p>
                    )}
                  </div>
                  <span className={`px-3 py-1.5 rounded-full text-sm font-semibold ${RENTAL_STATUS_BADGE[recStatus]}`}>
                    {RENTAL_STATUS_LABELS[recStatus]}
                  </span>
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-400">No record for this period yet.</p>
            )}
          </div>
          )}

          {/* Action bar */}
          {!readOnly && !isHistoricalView && (rec || unit.tenantId) && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-900 mb-1">Actions 操作</h2>
              <p className="text-xs text-gray-500 mb-4">Official rental actions for this unit 單位正式操作</p>
              <div className="flex flex-wrap gap-3">
                {rec && (
                  <button onClick={() => {
                    setInvoiceNote(rec.customInvoiceNote || '');
                    setInvoicePaymentTemplate(debitNoteCompanyForUnit(unit.unitName));
                    setInvoicePaymentRemark('');
                    setShowInvoiceModal(true);
                  }}
                    disabled={contractEnded}
                    className="px-5 py-2.5 bg-brand-600 text-white rounded-lg text-sm font-semibold hover:bg-brand-700 disabled:opacity-40">
                    📄 Send Invoice
                  </button>
                )}
                {unit.tenantId && (
                  <>
                    <DebitNoteActions
                      tenantId={unit.tenantId}
                      unitId={unit.id}
                      unitName={unit.unitName}
                      period={period}
                    />
                    <button onClick={openPaidModal}
                      className="px-5 py-2.5 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700">
                      ✓ Record Payment 記錄收款
                    </button>
                  </>
                )}
                {rec?.receiptRef && (
                  <Link href={`/rentals/records/${rec.id}/receipt`}
                    className="px-5 py-2.5 border border-gray-300 rounded-lg text-sm font-semibold hover:bg-gray-50">
                    🧾 View Receipt
                  </Link>
                )}
                {rec?.invoiceRef && (
                  <Link href={`/rentals/records/${rec.id}/invoice`}
                    className="px-5 py-2.5 border border-gray-300 rounded-lg text-sm font-semibold hover:bg-gray-50">
                    🖨 View Invoice
                  </Link>
                )}
                <button onClick={() => { setNoteText(''); setShowNoteModal(true); }}
                  className="px-5 py-2.5 border border-gray-300 rounded-lg text-sm font-semibold hover:bg-gray-50">
                  📝 Add Note
                </button>
              </div>
            </div>
          )}

          {unit.tenantId && (data.paymentHistory?.length ?? 0) > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-6">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="font-semibold text-gray-900">收款紀錄 Payment Receipts</h2>
                <p className="text-xs text-gray-500 mt-0.5">Allocations for {unit.unitName} only</p>
              </div>
              <PaymentHistoryTable
                payments={data.paymentHistory || []}
                readOnly={readOnly || isHistoricalView}
                onDelete={readOnly || isHistoricalView ? undefined : handleDeletePayment}
                deletingId={deletingPaymentId}
              />
            </div>
          )}

          {/* Payment ledger */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">租金紀錄 Payment History</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Lease period coverage — click a row for rent / water / electricity breakdown
                {currentLease && (
                  <span className="ml-1">
                    · {formatDisplayDate(currentLease.leaseStartDate)} → {formatDisplayDate(currentLease.actualEndDate || currentLease.leaseEndDate)}
                  </span>
                )}
              </p>
            </div>
            <RentalPaymentLedgerTable
              rows={paymentLedger || []}
              leaseLabel={unit.unitName}
            />
          </div>
        </div>

        {/* RIGHT — activity log */}
        <div className="bg-white rounded-2xl border border-gray-200 flex flex-col">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 text-sm">操作與通訊日誌 Activity Log</h2>
            <span className="text-xs text-gray-400">{activities.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[600px]">
            {activities.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No activity yet.</p>
            ) : (
              activities.map((a) => (
                <div key={a.id} className="flex gap-2">
                  <div className="h-7 w-7 rounded-full bg-brand-100 text-brand-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
                    {a.action.slice(0, 1)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-800">{a.action}</p>
                    {a.note && <p className="text-xs text-gray-500 mt-0.5 break-words">{a.note}</p>}
                    <p className="text-[10px] text-gray-300 mt-0.5">{a.created_at?.slice(0, 16)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Previous tenant records + lease documents */}
      <div className="grid lg:grid-cols-2 gap-6 mt-6">
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">歷任租客紀錄 Previous Tenant Records</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {isHistoricalView ? 'Viewing archived tenancy — select another row or return to current' : 'Click a completed tenancy to view read-only records'}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="text-xs uppercase tracking-wider text-gray-500 bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left">單位 Unit</th>
                  <th className="px-4 py-3 text-left">租單位人士 Tenant</th>
                  <th className="px-4 py-3 text-left">Contract 合約</th>
                  <th className="px-4 py-3 text-left">起租日</th>
                  <th className="px-4 py-3 text-left">完租日</th>
                  <th className="px-4 py-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {previousTenants.map((l) => (
                  <tr
                    key={l.id}
                    onClick={() => router.push(`/rentals/${unit.id}?leaseId=${l.id}`)}
                    className={`hover:bg-gray-50 cursor-pointer ${viewingLease?.id === l.id ? 'bg-brand-50/60' : ''}`}
                  >
                    <td className="px-4 py-3 font-semibold text-gray-900">{unit.unitName}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{l.tenantName}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {formatDisplayDate(l.leaseStartDate)} → {formatDisplayDate(l.actualEndDate || l.leaseEndDate)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{formatDisplayDate(l.leaseStartDate)}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDisplayDate(l.actualEndDate || l.leaseEndDate)}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-200">
                        {pastLeaseStatusLabel(l.status)}
                      </span>
                    </td>
                  </tr>
                ))}
                {previousTenants.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-sm">
                      No previous tenants for this unit yet.
                      {!currentLease && <span className="block mt-1 text-xs">Use <strong>完約 End Contract</strong> when a tenant moves out.</span>}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <div>
              <h2 className="font-semibold text-gray-900">Lease Documents 租約文件</h2>
              <p className="text-xs text-gray-500 mt-0.5">Agreement, handover, deposit receipt</p>
            </div>
            {currentLease && !readOnly && (
              <>
                <input ref={leaseDocInputRef} type="file" accept="image/*,.pdf" className="hidden"
                  onChange={(e) => { if (e.target.files?.[0]) uploadLeaseDoc(e.target.files[0]); e.target.value = ''; }} />
                <button
                  type="button"
                  disabled={leaseDocUploading}
                  onClick={() => leaseDocInputRef.current?.click()}
                  className="text-xs px-3 py-1.5 border rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                  {leaseDocUploading ? 'Uploading…' : '+ Upload'}
                </button>
              </>
            )}
          </div>
          <div className="p-4 space-y-2 max-h-72 overflow-y-auto">
            {!viewingLease && !currentLease ? (
              <p className="text-sm text-gray-400 text-center py-4">No lease selected</p>
            ) : (leaseDocuments || []).length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">No documents uploaded</p>
            ) : (
              (leaseDocuments || []).map((d) => (
                <a
                  key={d.id}
                  href={`/api/rentals/leases/${(viewingLease || currentLease)!.id}/documents?docId=${d.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 px-3 py-2 text-sm hover:bg-gray-50"
                >
                  <span>{d.label || d.docType}</span>
                  <span className="text-xs text-brand-600">View</span>
                </a>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Invoice Modal */}
      {showInvoiceModal && rec && (
        <Modal title="Send Invoice 發送租金單" onClose={() => setShowInvoiceModal(false)}>
          <div className="space-y-4">
            <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 text-sm">
              <p className="font-semibold text-gray-700 mb-2">Bill Summary</p>
              <div className="space-y-1">
                <div className="flex justify-between text-brand-700 gap-2">
                  <span className="text-xs">{baseRentLineLabel({ ...rec, billingPeriod: period, baseRentPeriodFrom, baseRentPeriodTo })}</span>
                  <span className="font-medium shrink-0">{formatMoney(Number(baseRent) || rec.baseRent)}</span>
                </div>
                <div className="flex justify-between text-blue-700">
                  <span>{utilityLineLabel('water', { waterPeriodFrom, waterPeriodTo, electricityPeriodFrom: '', electricityPeriodTo: '' })}</span>
                  <span>{formatUtilityAmount(Number(waterFee))}</span>
                </div>
                <div className="flex justify-between text-yellow-700">
                  <span>{utilityLineLabel('electricity', { waterPeriodFrom: '', waterPeriodTo: '', electricityPeriodFrom, electricityPeriodTo })}</span>
                  <span>{formatUtilityAmount(Number(electricityFee))}</span>
                </div>
                <div className="flex justify-between font-bold border-t pt-1 mt-1">
                  <span>Total</span>
                  <span className="text-lg">{formatMoney(rec.baseRent + Number(waterFee) + Number(electricityFee))}</span>
                </div>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Email Preview Note (optional)</label>
              <textarea className={inp} rows={3} value={invoiceNote} onChange={(e) => setInvoiceNote(e.target.value)} placeholder={`Dear ${unit.tenantName},…`} />
              <p className="text-xs text-gray-400 mt-1">Send to: {unit.tenantEmail || 'No email set — log only'}</p>
            </div>
            <DebitNotePaymentOptions
              templateId={invoicePaymentTemplate}
              onTemplateId={setInvoicePaymentTemplate}
              manualRemark={invoicePaymentRemark}
              onManualRemark={setInvoicePaymentRemark}
              showPreview
            />
            <div className="flex justify-between gap-3 flex-wrap">
              <div className="flex gap-2 flex-wrap">
                <Link href={`/rentals/records/${rec.id}/invoice`} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">Preview Print View</Link>
                {unit.tenantId && (
                  <Link
                    href={`/billing/debit-note?tenantId=${unit.tenantId}&unitId=${unit.id}&targetPeriod=${period}&mode=single&paymentTemplate=${invoicePaymentTemplate}${invoicePaymentRemark ? `&paymentRemark=${encodeURIComponent(invoicePaymentRemark)}` : ''}`}
                    className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50"
                  >
                    Formal Debit Note 繳費通知單
                  </Link>
                )}
              </div>
              <button onClick={sendInvoice} disabled={busy} className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
                {busy ? 'Sending…' : 'Send Invoice Now'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Record Payment Modal */}
      {showPaidModal && unit.tenantId && (
        <div className="modal-overlay">
          <div className="modal-panel sm:max-w-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold">Record Payment 記錄收款</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  Multi-month allocation — arrears first, then future months for advance rent
                </p>
              </div>
              <button onClick={() => setShowPaidModal(false)} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
            </div>

            <div className="rounded-xl bg-green-50 border border-green-200 p-4 mb-4">
              <p className="text-sm text-green-700">Outstanding for {unit.unitName} 未付總額</p>
              <p className="text-2xl font-bold text-green-800">
                {formatMoney((data.outstandingCharges || []).reduce((s, c) => s + chargeOutstanding(c), 0))}
              </p>
              <p className="text-xs text-green-600 mt-1">
                {(data.outstandingCharges || []).length} open charge item(s) · FIFO: rent → water → electricity
              </p>
            </div>

            <div className="flex gap-2 mb-4">
              <button
                type="button"
                onClick={() => setPaymentMode('byPeriod')}
                className={`text-xs px-3 py-1.5 rounded-lg border ${paymentMode === 'byPeriod' ? 'bg-brand-600 text-white border-brand-600' : 'hover:bg-gray-50'}`}
              >
                按期數 By Period
              </button>
              <button
                type="button"
                onClick={() => setPaymentMode('byType')}
                className={`text-xs px-3 py-1.5 rounded-lg border ${paymentMode === 'byType' ? 'bg-brand-600 text-white border-brand-600' : 'hover:bg-gray-50'}`}
              >
                按類型 By Type
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500">Paid Date 交租日</label>
                  <input className={inp} value={paymentForm.paymentDate} onChange={(e) => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })} placeholder="DD/MM/YYYY" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Total Amount 收款總額</label>
                  <input
                    type="number"
                    className={inp}
                    value={paymentForm.amount}
                    onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Method 方式</label>
                  <select
                    className={inp}
                    value={paymentForm.method}
                    onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })}
                  >
                    <option value="">Select method 選擇方式</option>
                    {RENTAL_PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>{RENTAL_PAYMENT_METHOD_LABELS[m]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500">Reference 參考</label>
                  <input className={inp} value={paymentForm.reference} onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })} />
                </div>
              </div>

              {paymentMode === 'byPeriod' ? (
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <label className="text-xs font-semibold text-gray-600 uppercase">Period breakdown 帳期明細</label>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="text-xs px-2 py-1 border rounded hover:bg-gray-50" onClick={fillOutstandingPeriodRows}>
                        填未付 Fill arrears
                      </button>
                      <button type="button" className="text-xs px-2 py-1 border rounded hover:bg-gray-50" onClick={() => fillAdvanceMonths(3)}>
                        預付3個月
                      </button>
                      <button type="button" className="text-xs px-2 py-1 border rounded hover:bg-gray-50" onClick={() => fillAdvanceMonths(6)}>
                        預付6個月
                      </button>
                      <button type="button" className="text-xs px-2 py-1 border rounded hover:bg-gray-50" onClick={() => fillAdvanceMonths(12)}>
                        預付12個月
                      </button>
                      <button type="button" className="text-xs px-2 py-1 border rounded hover:bg-gray-50" onClick={addPeriodRow}>
                        + Row
                      </button>
                    </div>
                  </div>
                  {periodRows.length === 0 ? (
                    <p className="text-sm text-gray-400 border border-dashed rounded-lg p-4 text-center">
                      Add period rows, or enter total only — system auto-allocates FIFO (including future months)
                    </p>
                  ) : (
                    <div className="border rounded-lg overflow-x-auto">
                      <table className="w-full text-sm min-w-[36rem]">
                        <thead className="bg-gray-50 text-xs text-gray-500">
                          <tr>
                            <th className="px-3 py-2 text-left">Period 帳期</th>
                            <th className="px-3 py-2 text-right">Rent 租金</th>
                            <th className="px-3 py-2 text-right">Electricity 電費</th>
                            <th className="px-3 py-2 text-right">Water 水費</th>
                            <th className="w-8" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {periodRows.map((row, idx) => (
                            <tr key={idx}>
                              <td className="px-3 py-2">
                                <input
                                  type="month"
                                  className="w-full text-xs border rounded px-2 py-1"
                                  value={row.billingPeriod}
                                  onChange={(e) => updatePeriodRow(idx, { billingPeriod: e.target.value })}
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="number"
                                  className="w-full text-xs border rounded px-2 py-1 text-right"
                                  value={row.rent}
                                  onChange={(e) => updatePeriodRow(idx, { rent: e.target.value })}
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="number"
                                  className="w-full text-xs border rounded px-2 py-1 text-right"
                                  value={row.electricity}
                                  onChange={(e) => updatePeriodRow(idx, { electricity: e.target.value })}
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="number"
                                  className="w-full text-xs border rounded px-2 py-1 text-right"
                                  value={row.water}
                                  onChange={(e) => updatePeriodRow(idx, { water: e.target.value })}
                                />
                              </td>
                              <td className="px-1 py-2">
                                <button
                                  type="button"
                                  className="text-gray-400 hover:text-red-600 text-xs"
                                  onClick={() => {
                                    setPeriodRows((prev) => {
                                      const next = prev.filter((_, i) => i !== idx);
                                      setPaymentForm((f) => ({ ...f, amount: String(sumPeriodBreakdownRows(next)) }));
                                      return next;
                                    });
                                  }}
                                >
                                  ✕
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <p className="text-xs text-gray-500 mt-2">
                    Period total: {formatMoney(sumPeriodBreakdownRows(periodRows))}
                    {paymentForm.amount && ` · Payment ${formatMoney(Number(paymentForm.amount) || 0)}`}
                  </p>
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-gray-600 uppercase">Payment split 分拆收款</label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="text-xs px-2 py-1 border rounded hover:bg-gray-50"
                        onClick={() => {
                          const filled = fillRentOnlyValues(chargeTypeRows);
                          setChargeAllocValues(filled);
                          setPaymentForm((f) => ({ ...f, amount: String(sumAllocationValues(filled) || f.amount) }));
                        }}
                      >
                        Rent only 只交租金
                      </button>
                      <button
                        type="button"
                        className="text-xs px-2 py-1 border rounded hover:bg-gray-50"
                        onClick={() => {
                          const filled = fillOutstandingValues(chargeTypeRows);
                          setChargeAllocValues(filled);
                          setPaymentForm((f) => ({ ...f, amount: String(sumAllocationValues(filled) || f.amount) }));
                        }}
                      >
                        Fill all 填滿未付
                      </button>
                    </div>
                  </div>
                  <ChargeAllocationGrid
                    rows={chargeTypeRows}
                    values={chargeAllocValues}
                    onChange={(v) => {
                      setChargeAllocValues(v);
                      setPaymentForm((f) => ({ ...f, amount: String(sumAllocationValues(v) || '') }));
                    }}
                    threeRow
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    Allocated: {formatMoney(sumAllocationValues(chargeAllocValues))}
                    {paymentForm.amount && ` / Payment ${formatMoney(Number(paymentForm.amount) || 0)}`}
                  </p>
                </div>
              )}

              {data.currentRecord && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Upload Bank Slip / 收款憑證 (optional)</p>
                  <div
                    onClick={() => receiptInputRef.current?.click()}
                    onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleReceiptUpload(f); }}
                    onDragOver={(e) => e.preventDefault()}
                    className="border-2 border-dashed border-gray-300 rounded-xl p-4 text-center cursor-pointer hover:border-brand-400 hover:bg-brand-50/40"
                  >
                    <input ref={receiptInputRef} type="file" accept="image/*" className="hidden"
                      onChange={(e) => { if (e.target.files?.[0]) handleReceiptUpload(e.target.files[0]); e.target.value = ''; }} />
                    {ocrLoading ? (
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-600 mx-auto" />
                    ) : receiptFile ? (
                      <p className="text-sm text-green-700 font-medium">✅ {receiptFile.name}</p>
                    ) : (
                      <p className="text-sm text-gray-500">Drop receipt image for AI extract (current period)</p>
                    )}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Notes 備註</label>
                <textarea className={inp} rows={2} value={paidNote} onChange={(e) => setPaidNote(e.target.value)} />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowPaidModal(false)} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
              <button onClick={confirmPaid} disabled={busy || !Number(paymentForm.amount)} className="px-5 py-2.5 bg-green-600 text-white rounded-lg text-sm font-bold disabled:opacity-50">
                {busy ? 'Saving…' : 'Save & Allocate 儲存並核銷'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* End Contract modal */}
      {showEndContractModal && (
        <Modal title="End Contract 完約" onClose={() => setShowEndContractModal(false)}>
          <div className="space-y-4 text-sm">
            <p className="text-gray-600">Close the current lease for <strong>{unit.tenantName}</strong>. Auto-invoices will stop after the lease end date.</p>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Actual move-out date 實際退租日</label>
              <input className={inp} value={endContractForm.actualEndDate} onChange={(e) => setEndContractForm({ ...endContractForm, actualEndDate: e.target.value })} placeholder="DD/MM/YYYY" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Deposit refund 退按金</label>
                <input type="number" className={inp} value={endContractForm.depositRefund} onChange={(e) => setEndContractForm({ ...endContractForm, depositRefund: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Deductions 扣除</label>
                <input type="number" className={inp} value={endContractForm.depositDeductions} onChange={(e) => setEndContractForm({ ...endContractForm, depositDeductions: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Notes 備註</label>
              <textarea className={inp} rows={2} value={endContractForm.endNotes} onChange={(e) => setEndContractForm({ ...endContractForm, endNotes: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={endContractForm.startNew} onChange={(e) => setEndContractForm({ ...endContractForm, startNew: e.target.checked })} />
              Start new lease immediately 立即新租約
            </label>
            {endContractForm.startNew && (
              <div className="rounded-xl border border-gray-200 p-3 space-y-3 bg-gray-50/50">
                <input className={inp} placeholder="New tenant name" value={endContractForm.newTenantName} onChange={(e) => setEndContractForm({ ...endContractForm, newTenantName: e.target.value })} />
                <div className="grid grid-cols-2 gap-2">
                  <input className={inp} placeholder="Start DD/MM/YYYY" value={endContractForm.newLeaseStart} onChange={(e) => setEndContractForm({ ...endContractForm, newLeaseStart: e.target.value })} />
                  <input className={inp} placeholder="End DD/MM/YYYY" value={endContractForm.newLeaseEnd} onChange={(e) => setEndContractForm({ ...endContractForm, newLeaseEnd: e.target.value })} />
                </div>
                <input type="number" className={inp} placeholder="Base rent" value={endContractForm.newBaseRent} onChange={(e) => setEndContractForm({ ...endContractForm, newBaseRent: e.target.value })} />
              </div>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowEndContractModal(false)} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
              <button onClick={submitEndContract} disabled={busy} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
                {busy ? 'Processing…' : 'Confirm End Contract'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Note modal */}
      {showNoteModal && (
        <Modal title="Log Activity Note" onClose={() => setShowNoteModal(false)}>
          <textarea className={inp} rows={4} value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="e.g. Tenant called about late payment…" />
          <div className="flex justify-end gap-3 mt-4">
            <button onClick={() => setShowNoteModal(false)} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
            <button onClick={logNote} disabled={busy} className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">
              Save Note
            </button>
          </div>
        </Modal>
      )}
    </AppLayout>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="modal-overlay">
      <div className="modal-panel max-h-[92vh]">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold">{title}</h2>
          <button onClick={onClose} className="inline-flex h-11 w-11 items-center justify-center text-gray-400 hover:text-gray-700 text-xl">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
