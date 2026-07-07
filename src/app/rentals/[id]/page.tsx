'use client';

import { useCallback, useEffect, useRef, useState, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import DebitNoteActions from '@/components/DebitNoteActions';
import UtilityBillingPicker from '@/components/UtilityBillingPicker';
import ElectricityMeterCalculator from '@/components/ElectricityMeterCalculator';
import WaterMeterCalculator from '@/components/WaterMeterCalculator';
import LeaseStatusBadge from '@/components/LeaseStatusBadge';
import PaymentHistoryTable from '@/components/PaymentHistoryTable';
import ChargeAllocationGrid, {
  chargeRowsFromRecord,
  fillOutstandingValues,
  fillRentOnlyValues,
  sumAllocationValues,
} from '@/components/ChargeAllocationGrid';
import { compressImage } from '@/lib/imageCompression';
import {
  RENTAL_STATUS_BADGE,
  RENTAL_STATUS_LABELS,
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
  outstandingBalance,
  toFormDate,
  todayFormDate,
  utilityLineLabel,
  calcElectricityFeeForFormula,
  calcWaterFeeFromMeter,
  electricityFormulaForUnit,
  formatBillingPeriodLabel,
  meterDataFromInputs,
  unitHasWaterMeterFormula,
  waterMeterDataFromInputs,
  type RentRecord,
  type RentalActivityLog,
  type RentalChargeItem,
  type RentalLease,
  type RentalLeaseDocument,
  type RentalPaymentReceipt,
  type RentalPaymentWithAllocations,
  type RentalUnit,
  type RentalUnitWithRecord,
  type UtilityBillingMode,
} from '@/lib/rentals';

interface DetailPayload {
  unit: RentalUnit;
  currentRecord: RentRecord | null;
  chargeItems?: RentalChargeItem[];
  history: RentRecord[];
  activities: RentalActivityLog[];
  latestReceipt: RentalPaymentReceipt | null;
  paymentHistory?: RentalPaymentWithAllocations[];
  currentLease?: RentalLease | null;
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
  const [utilityEditing, setUtilityEditing] = useState(false);
  const [utilityCanUndo, setUtilityCanUndo] = useState(false);
  const skipUtilityAutoSaveRef = useRef(true);
  const utilitySaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCommittedUtilityRef = useRef<UtilitySnapshot | null>(null);
  const undoUtilitySnapshotRef = useRef<UtilitySnapshot | null>(null);
  const skipUndoCaptureRef = useRef(false);

  // invoice modal
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoiceNote, setInvoiceNote] = useState('');

  // paid modal
  const [showPaidModal, setShowPaidModal] = useState(false);
  const [autoSendReceipt, setAutoSendReceipt] = useState(false);
  const [paidDate, setPaidDate] = useState(todayFormDate());
  const [paidAmount, setPaidAmount] = useState('');
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
  const [toast, setToast] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setUtilityEditing(false);
    setUtilityCanUndo(false);
    skipPeriodRecalcRef.current = true;
    skipUtilityAutoSaveRef.current = true;
    fetch(`/api/rentals/units/${id}?period=${period}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setData(d);
          setTenantName(d.unit.tenantName || '');
          setTenantPhone(d.unit.tenantPhone || '');
          setTenantEmail(d.unit.tenantEmail || '');
          setDueDateDay(String(d.unit.dueDateDay || 1));
          setBaseRent(String(d.currentRecord?.baseRent ?? d.unit.currentYearRent ?? 0));
          setUtilityBillingMode(d.unit.utilityBillingMode || 'company_proxy');
          setLeaseStartDate(d.unit.leaseStartDate ? toFormDate(d.unit.leaseStartDate) : '');
          setLeaseEndDate(d.unit.leaseEndDate ? toFormDate(d.unit.leaseEndDate) : '');
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
            setPaidAmount(String(outstandingBalance(rec) || rec.actualAmount || 0));
          }
        }
      })
      .finally(() => {
        skipPeriodRecalcRef.current = false;
        setLoading(false);
        setTimeout(() => { skipUtilityAutoSaveRef.current = false; }, 200);
      });
  }, [id, period]);

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
    setElectricityFee(fee > 0 || meter.currReading != null ? String(fee) : '');
  }, [electricityFormula, meterPrevReading, meterCurrReading, meter213B, meterStockRoom1, meterStockRoom2, meterRatePerUnit]);

  const inp = 'w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50/40 focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none';
  const roInp = `${inp} bg-gray-100/80 cursor-default focus:ring-0 focus:bg-gray-100/80`;

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
      baseRent: Number(baseRent),
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
  }, [baseRent, captureUtilitySnapshot, electricityFormula, waterMeterFormula]);

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
    if (loading || !data?.currentRecord) return;
    lastCommittedUtilityRef.current = captureUtilitySnapshot();
    setUtilityCanUndo(false);
    undoUtilitySnapshotRef.current = null;
  }, [data?.currentRecord?.id, period, loading, captureUtilitySnapshot]);

  useEffect(() => {
    if (skipUtilityAutoSaveRef.current || !data?.currentRecord || !utilityEditing) return;
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
    utilityEditing,
    baseRentPeriodFrom, baseRentPeriodTo,
    waterFee, waterPeriodFrom, waterPeriodTo,
    electricityFee, electricityPeriodFrom, electricityPeriodTo,
    meterPrevReading, meterCurrReading, meter213B, meterStockRoom1, meterStockRoom2, meterRatePerUnit,
    waterMeterPrev, waterMeterCurr, waterMeterRate,
    utilityNote,
  ]);

  const saveProfile = async () => {
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
      }),
    });
    if (data?.currentRecord) {
      await fetch(`/api/rentals/records/${data.currentRecord.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseRent: Number(baseRent) || 0 }),
      });
    }
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
      body: JSON.stringify({ ...buildUtilityPayload(), note: invoiceNote || null }),
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
      if (d.extracted?.transfer_date) setPaidDate(toFormDate(d.extracted.transfer_date));
      if (d.extracted?.amount) setPaidAmount(String(d.extracted.amount));
    }
  };

  const openPaidModal = () => {
    if (!data?.currentRecord) return;
    const items = data.chargeItems?.length
      ? data.chargeItems
      : [
          { chargeType: 'rent' as const, amountDue: data.currentRecord.baseRent, amountAllocated: 0 },
          { chargeType: 'water' as const, amountDue: data.currentRecord.waterFee, amountAllocated: 0 },
          { chargeType: 'electricity' as const, amountDue: data.currentRecord.electricityFee, amountAllocated: 0 },
        ];
    const rows = chargeRowsFromRecord(items);
    const filled = fillOutstandingValues(rows);
    setChargeAllocValues(filled);
    setPaidAmount(String(sumAllocationValues(filled) || outstandingBalance(data.currentRecord)));
    setShowPaidModal(true);
    setOcrResult(null);
    setReceiptFile(null);
    setPaidDate(data.currentRecord.paidDate ? toFormDate(data.currentRecord.paidDate) : todayFormDate());
  };

  const confirmPaid = async () => {
    if (!data?.currentRecord) return;
    const chargeAllocations = (['rent', 'water', 'electricity'] as const)
      .map((chargeType) => ({ chargeType, amount: Number(chargeAllocValues[chargeType] || 0) }))
      .filter((a) => a.amount > 0);
    const allocSum = chargeAllocations.reduce((s, a) => s + a.amount, 0);
    if (allocSum <= 0) {
      setToast('Allocate at least one charge type (rent / water / electricity)');
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/rentals/records/${data.currentRecord.id}/paid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        autoSendReceiptEmail: autoSendReceipt,
        note: paidNote || null,
        paidDate: fromFormDate(paidDate),
        amount: allocSum,
        chargeAllocations,
      }),
    });
    setBusy(false);
    const d = await res.json().catch(() => ({}));
    setToast(res.ok ? (d.fullyPaid ? 'Marked paid!' : 'Partial payment recorded') : 'Failed to record payment');
    setShowPaidModal(false);
    setOcrResult(null);
    setReceiptFile(null);
    load();
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

  const { unit, currentRecord, history, activities, currentLease, leaseHistory, leaseDocuments } = data;
  const rec = currentRecord;
  const remaining = daysRemaining(unit.leaseEndDate);
  const recStatus = rec ? displayRentalStatus(rec) : 'pending';
  const balance = rec ? outstandingBalance(rec) : 0;
  const autoRentPeriod = calcBasicRentPeriod(Number(dueDateDay) || 1);
  const leaseStatus = currentLease
    ? computeLeaseDisplayStatus(currentLease)
    : unit.tenantName?.trim() && unit.tenantName !== 'Vacant 空置' ? 'active' : 'vacant';
  const contractEnded = leaseStatus === 'ended' || leaseStatus === 'terminated' || leaseStatus === 'vacant';
  const previousTenants = (leaseHistory || []).filter((l) => !l.isCurrent);

  return (
    <AppLayout>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-3">
        <button onClick={() => router.push('/rentals')} className="text-sm text-brand-600 font-medium min-h-[44px] sm:min-h-0 text-left">← Back to Rentals</button>
        <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className={`${inp} w-full sm:w-auto`} />
      </div>

      {toast && <div onClick={() => setToast('')} className="mb-4 p-3 bg-brand-50 text-brand-700 text-sm rounded-lg cursor-pointer">{toast} ✕</div>}

      {/* Header — editable profile */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
        <div className="flex items-start justify-between flex-wrap gap-4 mb-5">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-brand-600 font-semibold">Unit Profile 單位資料</p>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">{unit.unitName}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-lg bg-brand-50 border border-brand-200 px-3 py-1.5 text-sm font-medium text-brand-800">
                帳期 Billing: {formatBillingPeriodLabel(period)}
              </span>
              <LeaseStatusBadge status={leaseStatus} />
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
            {!contractEnded && (
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
            {unit.tenantId ? (
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
            ) : (
              <p className="text-xs text-amber-600 self-center">Save tenant name to enable rent payment notice</p>
            )}
          </div>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Tenant Name 租單位人士</label>
            <input className={inp} value={tenantName} onChange={(e) => setTenantName(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Phone 電話</label>
            <input type="tel" className={inp} value={tenantPhone} onChange={(e) => setTenantPhone(e.target.value)} placeholder="+852…" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
            <input type="email" className={inp} value={tenantEmail} onChange={(e) => setTenantEmail(e.target.value)} placeholder="tenant@email.com" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">每月交租日 Due Day (1–31)</label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500 whitespace-nowrap">每月</span>
              <input type="number" min={1} max={31} className={`${inp} w-20 text-center`} value={dueDateDay} onChange={(e) => setDueDateDay(e.target.value)} />
              <span className="text-sm text-gray-500 whitespace-nowrap">日</span>
              <span className="text-sm font-medium text-brand-700 ml-1">{formatDueDayLabel(Number(dueDateDay) || 1)}</span>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">基本租金 Base Rent / month</label>
            <input type="number" min={0} className={inp} value={baseRent} onChange={(e) => setBaseRent(e.target.value)} />
          </div>
          <div className="md:col-span-2 lg:col-span-2">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">起租日 Lease Start 租期</label>
                <input type="text" inputMode="numeric" placeholder="DD/MM/YYYY" className={inp} value={leaseStartDate} onChange={(e) => setLeaseStartDate(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">完租日 Lease End 租期</label>
                <input type="text" inputMode="numeric" placeholder="DD/MM/YYYY" className={inp} value={leaseEndDate} onChange={(e) => setLeaseEndDate(e.target.value)} />
              </div>
            </div>
          </div>
        </div>
        <div className="mt-6 pt-5 border-t border-gray-100">
          <label className="block text-xs font-medium text-gray-500 mb-2">水電費安排 Utility Billing</label>
          <p className="text-xs text-gray-400 mb-3">Controls whether water &amp; electricity appear on debit notes for this unit</p>
          <UtilityBillingPicker
            value={utilityBillingMode}
            onChange={setUtilityBillingMode}
          />
        </div>
        <div className="mt-4 flex justify-end">
          <button onClick={saveProfile} disabled={profileSaving} className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
            {profileSaving ? 'Saving…' : 'Save Profile 儲存資料'}
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_340px] gap-6 lg:items-start">
        {/* LEFT */}
        <div className="space-y-6">
          {/* Utility / billing for current month */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
              <div>
                <p className="text-[11px] uppercase tracking-widest text-brand-600 font-semibold">水電費紀錄與帳單</p>
                <h2 className="text-lg font-semibold text-gray-900">Utilities & Billing — {period}</h2>
              </div>
              {rec && (
                utilityEditing ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (utilitySaveTimerRef.current) {
                        clearTimeout(utilitySaveTimerRef.current);
                        utilitySaveTimerRef.current = null;
                      }
                      void saveUtilities();
                      setUtilityEditing(false);
                    }}
                    className="text-xs px-3 py-1.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700"
                  >
                    Done 完成
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setUtilityEditing(true)}
                    className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Edit 編輯
                  </button>
                )
              )}
            </div>
            <p className="text-xs text-gray-500 mb-4">
              {utilityEditing
                ? 'Changes auto-save. Use Undo if you made a mistake.'
                : 'Meter readings and billing periods are locked — click Edit 編輯 before changing.'}
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
                      <input type="text" inputMode="numeric" placeholder="DD/MM/YYYY" value={baseRentPeriodFrom} onChange={(e) => setBaseRentPeriodFrom(e.target.value)} readOnly={!utilityEditing} className={utilityEditing ? inp : roInp} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Period To 計費結束</label>
                      <input type="text" inputMode="numeric" placeholder="DD/MM/YYYY" value={baseRentPeriodTo} onChange={(e) => setBaseRentPeriodTo(e.target.value)} readOnly={!utilityEditing} className={utilityEditing ? inp : roInp} />
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    Auto ({formatDueDayLabel(Number(dueDateDay) || 1)}): {autoRentPeriod.formattedRange}
                  </p>
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
                        inpClassName={utilityEditing ? inp : roInp}
                        readOnly={!utilityEditing}
                      />
                      <div className="grid md:grid-cols-2 gap-3 mt-4">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Period From 計費起始</label>
                          <input type="text" inputMode="numeric" placeholder="DD/MM/YYYY" value={waterPeriodFrom} onChange={(e) => setWaterPeriodFrom(e.target.value)} readOnly={!utilityEditing} className={utilityEditing ? inp : roInp} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Period To 計費結束</label>
                          <input type="text" inputMode="numeric" placeholder="DD/MM/YYYY" value={waterPeriodTo} onChange={(e) => setWaterPeriodTo(e.target.value)} readOnly={!utilityEditing} className={utilityEditing ? inp : roInp} />
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="grid md:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Amount 金額</label>
                        <input type="number" min={0} value={waterFee} onChange={(e) => setWaterFee(e.target.value)} readOnly={!utilityEditing} className={utilityEditing ? inp : roInp} placeholder="0 → shows /" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Period From 計費起始</label>
                        <input type="text" inputMode="numeric" placeholder="DD/MM/YYYY" value={waterPeriodFrom} onChange={(e) => setWaterPeriodFrom(e.target.value)} readOnly={!utilityEditing} className={utilityEditing ? inp : roInp} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Period To 計費結束</label>
                        <input type="text" inputMode="numeric" placeholder="DD/MM/YYYY" value={waterPeriodTo} onChange={(e) => setWaterPeriodTo(e.target.value)} readOnly={!utilityEditing} className={utilityEditing ? inp : roInp} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Electricity */}
                <div className="rounded-xl border border-yellow-100 bg-yellow-50/40 p-4 mb-4">
                  <p className="text-sm font-semibold text-yellow-800 mb-3">電費 Electricity Fee</p>
                  {electricityFormula ? (
                    <>
                      <p className="text-xs text-yellow-700/80 mb-3">
                        {electricityFormula === '213a'
                          ? '213A formula: net usage (after deducting other units) × rate'
                          : 'Stock Room formula: (current − previous reading) × rate'}
                      </p>
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
                        inpClassName={utilityEditing ? inp : roInp}
                        readOnly={!utilityEditing}
                      />
                      <div className="grid md:grid-cols-2 gap-3 mt-4">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Period From 計費起始</label>
                          <input type="text" inputMode="numeric" placeholder="DD/MM/YYYY" value={electricityPeriodFrom} onChange={(e) => setElectricityPeriodFrom(e.target.value)} readOnly={!utilityEditing} className={utilityEditing ? inp : roInp} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Period To 計費結束</label>
                          <input type="text" inputMode="numeric" placeholder="DD/MM/YYYY" value={electricityPeriodTo} onChange={(e) => setElectricityPeriodTo(e.target.value)} readOnly={!utilityEditing} className={utilityEditing ? inp : roInp} />
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="grid md:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Amount 金額</label>
                        <input type="number" min={0} value={electricityFee} onChange={(e) => setElectricityFee(e.target.value)} readOnly={!utilityEditing} className={utilityEditing ? inp : roInp} placeholder="0 → shows /" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Period From 計費起始</label>
                        <input type="text" inputMode="numeric" placeholder="DD/MM/YYYY" value={electricityPeriodFrom} onChange={(e) => setElectricityPeriodFrom(e.target.value)} readOnly={!utilityEditing} className={utilityEditing ? inp : roInp} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Period To 計費結束</label>
                        <input type="text" inputMode="numeric" placeholder="DD/MM/YYYY" value={electricityPeriodTo} onChange={(e) => setElectricityPeriodTo(e.target.value)} readOnly={!utilityEditing} className={utilityEditing ? inp : roInp} />
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex items-end gap-4">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Invoice Note (optional)</label>
                    <input className={utilityEditing ? inp : roInp} value={utilityNote} onChange={(e) => setUtilityNote(e.target.value)} readOnly={!utilityEditing} placeholder="e.g. Water meter 1234" />
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
                    <p className="text-3xl font-bold text-brand-700">{formatMoney(rec.actualAmount)}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Rent {formatMoney(rec.baseRent)} + Water {formatUtilityAmount(rec.waterFee)} + Elec {formatUtilityAmount(rec.electricityFee)}
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

          {/* Action bar */}
          {rec && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-900 mb-4">Actions</h2>
              <div className="flex flex-wrap gap-3">
                <button onClick={() => { setInvoiceNote(rec.customInvoiceNote || ''); setShowInvoiceModal(true); }}
                  disabled={contractEnded}
                  className="px-5 py-2.5 bg-brand-600 text-white rounded-lg text-sm font-semibold hover:bg-brand-700 disabled:opacity-40">
                  📄 Send Invoice
                </button>
                <button onClick={openPaidModal}
                  disabled={recStatus === 'paid'}
                  className="px-5 py-2.5 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-40">
                  {recStatus === 'partial' ? '💰 Record Payment' : '✓ Record Payment 記錄收款'}
                </button>
                {rec.receiptRef && (
                  <Link href={`/rentals/records/${rec.id}/receipt`}
                    className="px-5 py-2.5 border border-gray-300 rounded-lg text-sm font-semibold hover:bg-gray-50">
                    🧾 View Receipt
                  </Link>
                )}
                {rec.invoiceRef && (
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
              <PaymentHistoryTable payments={data.paymentHistory || []} readOnly />
            </div>
          )}

          {/* History */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">以往租金紀錄 Payment History</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[600px]">
                <thead className="text-xs uppercase tracking-wider text-gray-500 bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left">Period</th>
                    <th className="px-4 py-3 text-right">Base</th>
                    <th className="px-4 py-3 text-right">Water</th>
                    <th className="px-4 py-3 text-right">Electricity</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3 text-left">以往交租日</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-right">Docs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {history.map((r) => {
                    const hStatus = displayRentalStatus(r);
                    return (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{r.billingPeriod}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{formatMoney(r.baseRent)}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{formatUtilityAmount(r.waterFee)}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{formatUtilityAmount(r.electricityFee)}</td>
                      <td className="px-4 py-3 text-right font-semibold">
                        {formatMoney(r.actualAmount)}
                        {r.amountPaid > 0 && r.amountPaid < r.actualAmount && (
                          <p className="text-[10px] text-orange-600 font-normal">Paid {formatMoney(r.amountPaid)}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{formatDisplayDate(r.paidDate || r.paidAt?.slice(0, 10))}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${RENTAL_STATUS_BADGE[hStatus]}`}>
                          {RENTAL_STATUS_LABELS[hStatus]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="space-x-2">
                          {r.invoiceRef && <Link href={`/rentals/records/${r.id}/invoice`} className="text-brand-600 text-xs hover:underline">Invoice</Link>}
                          {r.receiptRef && <Link href={`/rentals/records/${r.id}/receipt`} className="text-brand-600 text-xs hover:underline">Receipt</Link>}
                        </span>
                      </td>
                    </tr>
                    );
                  })}
                  {history.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No history yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
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

      {/* Tenant history + lease documents — last row */}
      <div className="grid lg:grid-cols-2 gap-6 mt-6">
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">Tenant History 租客紀錄</h2>
            <p className="text-xs text-gray-500 mt-0.5">Current and past tenants for this unit</p>
          </div>
          <div className="p-4 space-y-5 max-h-[28rem] overflow-y-auto">
            {currentLease && (
              <div>
                <p className="text-[11px] uppercase tracking-widest text-brand-600 font-semibold mb-2">Current Tenant 現任租客</p>
                <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {currentLease.tenantId ? (
                      <Link href={`/rentals/tenants/${currentLease.tenantId}`} className="font-semibold text-brand-700 hover:underline">
                        {currentLease.tenantName}
                      </Link>
                    ) : (
                      <p className="font-semibold text-gray-900">{currentLease.tenantName}</p>
                    )}
                    <LeaseStatusBadge status={computeLeaseDisplayStatus(currentLease)} />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {formatDisplayDate(currentLease.leaseStartDate)} → {formatDisplayDate(currentLease.leaseEndDate)}
                  </p>
                  {(currentLease.tenantPhone || currentLease.tenantEmail) && (
                    <p className="text-xs text-gray-500 mt-1">
                      {currentLease.tenantPhone && <span>{currentLease.tenantPhone}</span>}
                      {currentLease.tenantPhone && currentLease.tenantEmail && <span className="mx-1">·</span>}
                      {currentLease.tenantEmail && <span>{currentLease.tenantEmail}</span>}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    Rent {formatMoney(currentLease.baseRent)} · Deposit {formatMoney(currentLease.depositAmount)}
                  </p>
                </div>
              </div>
            )}

            <div>
              <p className="text-[11px] uppercase tracking-widest text-gray-500 font-semibold mb-2">Previous Tenants 歷任租客</p>
              {previousTenants.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4 rounded-xl border border-dashed border-gray-200">
                  No previous tenants recorded yet.
                  {!currentLease && (leaseHistory || []).length === 0 && (
                    <span className="block mt-1 text-xs">Use <strong>完約 End Contract</strong> when a tenant moves out to keep a full history.</span>
                  )}
                </p>
              ) : (
                <div className="space-y-3">
                  {previousTenants.map((l) => (
                    <div key={l.id} className="rounded-xl border border-gray-100 p-3 text-sm hover:border-gray-200 transition-colors">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        {l.tenantId ? (
                          <Link href={`/rentals/tenants/${l.tenantId}`} className="font-semibold text-brand-700 hover:underline">
                            {l.tenantName}
                          </Link>
                        ) : (
                          <p className="font-semibold text-gray-900">{l.tenantName}</p>
                        )}
                        <LeaseStatusBadge status={computeLeaseDisplayStatus(l)} />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {formatDisplayDate(l.leaseStartDate)} → {formatDisplayDate(l.actualEndDate || l.leaseEndDate)}
                      </p>
                      {(l.tenantPhone || l.tenantEmail) && (
                        <p className="text-xs text-gray-500 mt-1">
                          {l.tenantPhone && <span>{l.tenantPhone}</span>}
                          {l.tenantPhone && l.tenantEmail && <span className="mx-1">·</span>}
                          {l.tenantEmail && <span>{l.tenantEmail}</span>}
                        </p>
                      )}
                      <p className="text-xs text-gray-500 mt-1">
                        Rent {formatMoney(l.baseRent)} · Deposit {formatMoney(l.depositAmount)}
                        {l.depositRefund != null && (
                          <span> · Refund {formatMoney(l.depositRefund)}</span>
                        )}
                      </p>
                      {(l.endReason || l.endNotes) && (
                        <p className="text-xs text-gray-400 mt-1">
                          {l.endReason}
                          {l.endReason && l.endNotes && ' — '}
                          {l.endNotes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {previousTenants.length > 0 && (
                <p className="text-[11px] text-gray-400 mt-3">
                  History is recorded when you use <strong>完約 End Contract</strong>. Older manual edits may not appear here.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <div>
              <h2 className="font-semibold text-gray-900">Lease Documents 租約文件</h2>
              <p className="text-xs text-gray-500 mt-0.5">Agreement, handover, deposit receipt</p>
            </div>
            {currentLease && (
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
            {!currentLease ? (
              <p className="text-sm text-gray-400 text-center py-4">No active lease</p>
            ) : (leaseDocuments || []).length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">No documents uploaded</p>
            ) : (
              (leaseDocuments || []).map((d) => (
                <a
                  key={d.id}
                  href={`/api/rentals/leases/${currentLease.id}/documents?docId=${d.id}`}
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
            <div className="flex justify-between gap-3">
              <Link href={`/rentals/records/${rec.id}/invoice`} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">Preview Print View</Link>
              <button onClick={sendInvoice} disabled={busy} className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
                {busy ? 'Sending…' : 'Send Invoice Now'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Record Payment Modal */}
      {showPaidModal && rec && (
        <Modal title="Record Payment 記錄收款" onClose={() => setShowPaidModal(false)}>
          <div className="space-y-5">
            <div className="rounded-xl bg-green-50 border border-green-200 p-4">
              <p className="text-sm text-green-700">Total Due 應付總額</p>
              <p className="text-3xl font-bold text-green-800">{formatMoney(rec.actualAmount)}</p>
              <p className="text-xs text-green-600 mt-1">
                Rent {formatMoney(rec.baseRent)} + Water {formatUtilityAmount(rec.waterFee)} + Elec {formatUtilityAmount(rec.electricityFee)}
              </p>
              {rec.amountPaid > 0 && (
                <p className="text-sm text-orange-700 mt-2 font-semibold">
                  Already paid {formatMoney(rec.amountPaid)} · Outstanding {formatMoney(balance)}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Payment Amount 本次收款金額</label>
              <input type="number" min={0} step="0.01" className={inp} value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)} />
              <div className="flex gap-2 mt-2 flex-wrap">
                <button type="button" onClick={() => {
                  const items = data?.chargeItems || [];
                  const rows = chargeRowsFromRecord(items.length ? items : [
                    { chargeType: 'rent', amountDue: rec.baseRent, amountAllocated: 0 },
                    { chargeType: 'water', amountDue: rec.waterFee, amountAllocated: 0 },
                    { chargeType: 'electricity', amountDue: rec.electricityFee, amountAllocated: 0 },
                  ]);
                  const filled = fillRentOnlyValues(rows);
                  setChargeAllocValues(filled);
                  setPaidAmount(String(sumAllocationValues(filled)));
                }}
                  className="px-3 py-1 text-xs border rounded-lg hover:bg-gray-50">Rent only 只交租金</button>
                <button type="button" onClick={() => {
                  const items = data?.chargeItems || [];
                  const rows = chargeRowsFromRecord(items.length ? items : [
                    { chargeType: 'rent', amountDue: rec.baseRent, amountAllocated: 0 },
                    { chargeType: 'water', amountDue: rec.waterFee, amountAllocated: 0 },
                    { chargeType: 'electricity', amountDue: rec.electricityFee, amountAllocated: 0 },
                  ]);
                  const filled = fillOutstandingValues(rows);
                  setChargeAllocValues(filled);
                  setPaidAmount(String(sumAllocationValues(filled)));
                }}
                  className="px-3 py-1 text-xs border rounded-lg hover:bg-gray-50">Full balance 全數</button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">Split by charge type 分拆入帳</label>
              <ChargeAllocationGrid
                rows={chargeRowsFromRecord(
                  (data?.chargeItems?.length ? data.chargeItems : [
                    { chargeType: 'rent', amountDue: rec.baseRent, amountAllocated: 0, status: 'unpaid' as const },
                    { chargeType: 'water', amountDue: rec.waterFee, amountAllocated: 0, status: 'unpaid' as const },
                    { chargeType: 'electricity', amountDue: rec.electricityFee, amountAllocated: 0, status: 'unpaid' as const },
                  ])
                )}
                values={chargeAllocValues}
                onChange={(v) => {
                  setChargeAllocValues(v);
                  setPaidAmount(String(sumAllocationValues(v)));
                }}
                threeRow
              />
            </div>

            {/* AI Receipt Upload */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Upload Bank Slip / 收款憑證 (AI Auto-Extract)</p>
              <div
                onClick={() => receiptInputRef.current?.click()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleReceiptUpload(f); }}
                onDragOver={(e) => e.preventDefault()}
                className="border-2 border-dashed border-gray-300 rounded-xl p-5 text-center cursor-pointer hover:border-brand-400 hover:bg-brand-50/40 min-h-[80px] flex flex-col items-center justify-center gap-1"
              >
                <input ref={receiptInputRef} type="file" accept="image/*" className="hidden"
                  onChange={(e) => { if (e.target.files?.[0]) handleReceiptUpload(e.target.files[0]); e.target.value = ''; }} />
                {ocrLoading ? (
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-600" />
                ) : receiptFile ? (
                  <p className="text-sm text-green-700 font-medium">✅ {receiptFile.name}</p>
                ) : (
                  <>
                    <p className="text-sm text-gray-500">Drop receipt image or click to upload</p>
                    <p className="text-xs text-gray-400">AI extracts amount, method, date, account</p>
                  </>
                )}
              </div>
              {ocrResult && (
                <div className={`mt-3 rounded-xl border p-4 text-sm ${ocrResult.matched ? 'border-green-200 bg-green-50' : 'border-yellow-200 bg-yellow-50'}`}>
                  <p className="font-semibold mb-2">{ocrResult.matched ? '✅ Amount Matched' : '⚠ Review Required'}</p>
                  <div className="grid grid-cols-2 gap-y-1">
                    <span className="text-gray-500">Amount:</span>
                    <span className={`font-semibold ${ocrResult.matched ? 'text-green-700' : 'text-yellow-700'}`}>
                      {ocrResult.extracted.amount !== null ? formatMoney(ocrResult.extracted.amount) : '—'}
                      {ocrResult.matched ? ' ✓' : ' (differs)'}
                    </span>
                    <span className="text-gray-500">Method:</span><span>{ocrResult.extracted.method || '—'}</span>
                    <span className="text-gray-500">Date:</span><span>{formatDisplayDate(ocrResult.extracted.transfer_date)}</span>
                    <span className="text-gray-500">Account:</span><span>{ocrResult.extracted.receiving_account || '—'}</span>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Paid Date 交租日子</label>
              <input type="text" inputMode="numeric" placeholder="DD/MM/YYYY" className={inp} value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
            </div>

            <label className="flex items-center gap-3 text-sm font-medium cursor-pointer">
              <input type="checkbox" checked={autoSendReceipt} onChange={(e) => setAutoSendReceipt(e.target.checked)}
                className="h-4 w-4 rounded" />
              付款後自動發送收據 Email (Auto-send receipt email upon confirmation)
            </label>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Receipt Note (optional)</label>
              <textarea className={inp} rows={2} value={paidNote} onChange={(e) => setPaidNote(e.target.value)} />
            </div>

            <div className="flex justify-end gap-3">
              <button onClick={() => setShowPaidModal(false)} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
              <button onClick={confirmPaid} disabled={busy || sumAllocationValues(chargeAllocValues) <= 0} className="px-5 py-2.5 bg-green-600 text-white rounded-lg text-sm font-bold disabled:opacity-50">
                {busy ? 'Saving…' : sumAllocationValues(chargeAllocValues) >= balance - 0.01 ? 'Confirm Full Payment 確認全數收款' : 'Record Partial Payment 記錄部分收款'}
              </button>
            </div>
          </div>
        </Modal>
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
