'use client';

import { useCallback, useEffect, useRef, useState, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
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
  type RentRecord,
  type RentalActivityLog,
  type RentalChargeItem,
  type RentalPaymentReceipt,
  type RentalUnit,
  type RentalUnitWithRecord,
} from '@/lib/rentals';

interface DetailPayload {
  unit: RentalUnit;
  currentRecord: RentRecord | null;
  chargeItems?: RentalChargeItem[];
  history: RentRecord[];
  activities: RentalActivityLog[];
  latestReceipt: RentalPaymentReceipt | null;
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
  const [utilityNote, setUtilityNote] = useState('');
  const [utilitySaving, setUtilitySaving] = useState(false);

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

  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    skipPeriodRecalcRef.current = true;
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
            setUtilityNote(rec.customInvoiceNote || '');
            setAutoSendReceipt(d.unit.autoSendReceiptEmail);
            setPaidAmount(String(outstandingBalance(rec) || rec.actualAmount || 0));
          }
        }
      })
      .finally(() => {
        skipPeriodRecalcRef.current = false;
        setLoading(false);
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

  const inp = 'w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50/40 focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none';

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

  const utilityPayload = () => ({
    baseRent: Number(baseRent),
    baseRentPeriodFrom: fromFormDate(baseRentPeriodFrom),
    baseRentPeriodTo: fromFormDate(baseRentPeriodTo),
    waterFee: Number(waterFee),
    electricityFee: Number(electricityFee),
    waterPeriodFrom: fromFormDate(waterPeriodFrom),
    waterPeriodTo: fromFormDate(waterPeriodTo),
    electricityPeriodFrom: fromFormDate(electricityPeriodFrom),
    electricityPeriodTo: fromFormDate(electricityPeriodTo),
    customInvoiceNote: utilityNote || null,
  });

  const saveUtilities = async () => {
    if (!data?.currentRecord) return;
    setUtilitySaving(true);
    await fetch(`/api/rentals/records/${data.currentRecord.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(utilityPayload()),
    });
    setUtilitySaving(false);
    load();
  };

  const sendInvoice = async () => {
    if (!data?.currentRecord) return;
    setBusy(true);
    const res = await fetch(`/api/rentals/records/${data.currentRecord.id}/invoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...utilityPayload(), note: invoiceNote || null }),
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

  if (loading) return <AppLayout><div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" /></div></AppLayout>;
  if (!data) return <AppLayout><div className="p-12 text-center text-gray-500">Unit not found. <button onClick={() => router.push('/rentals')} className="text-brand-600 underline">Back</button></div></AppLayout>;

  const { unit, currentRecord, history, activities } = data;
  const rec = currentRecord;
  const remaining = daysRemaining(unit.leaseEndDate);
  const recStatus = rec ? displayRentalStatus(rec) : 'pending';
  const balance = rec ? outstandingBalance(rec) : 0;
  const autoRentPeriod = calcBasicRentPeriod(Number(dueDateDay) || 1);

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
            <p className="text-xs text-gray-400 mt-2">Lease {formatDisplayDate(unit.leaseStartDate)} → {formatDisplayDate(unit.leaseEndDate)}
              {remaining !== null && (
                <span className={`ml-2 font-semibold ${remaining < 60 ? 'text-red-600' : 'text-gray-600'}`}>
                  · {remaining} days remaining
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {unit.tenantId ? (
              <>
                <Link
                  href={`/rentals/tenants/${unit.tenantId}`}
                  className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Tenant Ledger 租客
                </Link>
                <Link
                  href={`/rentals/units/${unit.id}/rent-payment-notice?period=${period}`}
                  className="px-3 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700"
                >
                  繳付租金通知單 Notice
                </Link>
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
            <p className="text-[11px] uppercase tracking-widest text-brand-600 font-semibold mb-1">水電費紀錄與帳單</p>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Utilities & Billing — {period}</h2>
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
                      <input type="text" inputMode="numeric" placeholder="DD/MM/YYYY" value={baseRentPeriodFrom} onChange={(e) => setBaseRentPeriodFrom(e.target.value)} className={inp} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Period To 計費結束</label>
                      <input type="text" inputMode="numeric" placeholder="DD/MM/YYYY" value={baseRentPeriodTo} onChange={(e) => setBaseRentPeriodTo(e.target.value)} className={inp} />
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    Auto ({formatDueDayLabel(Number(dueDateDay) || 1)}): {autoRentPeriod.formattedRange}
                  </p>
                </div>

                {/* Water */}
                <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4 mb-4">
                  <p className="text-sm font-semibold text-blue-800 mb-3">水費 Water Fee</p>
                  <div className="grid md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Amount 金額</label>
                      <input type="number" min={0} value={waterFee} onChange={(e) => setWaterFee(e.target.value)} className={inp} placeholder="0 → shows /" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Period From 計費起始</label>
                      <input type="text" inputMode="numeric" placeholder="DD/MM/YYYY" value={waterPeriodFrom} onChange={(e) => setWaterPeriodFrom(e.target.value)} className={inp} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Period To 計費結束</label>
                      <input type="text" inputMode="numeric" placeholder="DD/MM/YYYY" value={waterPeriodTo} onChange={(e) => setWaterPeriodTo(e.target.value)} className={inp} />
                    </div>
                  </div>
                </div>

                {/* Electricity */}
                <div className="rounded-xl border border-yellow-100 bg-yellow-50/40 p-4 mb-4">
                  <p className="text-sm font-semibold text-yellow-800 mb-3">電費 Electricity Fee</p>
                  <div className="grid md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Amount 金額</label>
                      <input type="number" min={0} value={electricityFee} onChange={(e) => setElectricityFee(e.target.value)} className={inp} placeholder="0 → shows /" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Period From 計費起始</label>
                      <input type="text" inputMode="numeric" placeholder="DD/MM/YYYY" value={electricityPeriodFrom} onChange={(e) => setElectricityPeriodFrom(e.target.value)} className={inp} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Period To 計費結束</label>
                      <input type="text" inputMode="numeric" placeholder="DD/MM/YYYY" value={electricityPeriodTo} onChange={(e) => setElectricityPeriodTo(e.target.value)} className={inp} />
                    </div>
                  </div>
                </div>
                <div className="flex items-end gap-4">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Invoice Note (optional)</label>
                    <input className={inp} value={utilityNote} onChange={(e) => setUtilityNote(e.target.value)} placeholder="e.g. Water meter 1234" />
                  </div>
                  <button onClick={saveUtilities} disabled={utilitySaving} className="px-4 py-2.5 bg-gray-100 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50">
                    {utilitySaving ? 'Saving…' : 'Save Utilities'}
                  </button>
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
                  className="px-5 py-2.5 bg-brand-600 text-white rounded-lg text-sm font-semibold hover:bg-brand-700">
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
