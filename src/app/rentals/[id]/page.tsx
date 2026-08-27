'use client';

import { useRef, useState, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import TenantSelect from '@/components/TenantSelect';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/components/AuthProvider';
import { BTN, MSG, bi } from '@/lib/ui-labels';
import DebitNoteActions from '@/components/DebitNoteActions';
import UtilityBillingPicker from '@/components/UtilityBillingPicker';
import LeaseStatusBadge from '@/components/LeaseStatusBadge';
import PaymentHistoryTable from '@/components/PaymentHistoryTable';
import RentalPaymentLedgerTable from '@/components/RentalPaymentLedgerTable';
import RentalUtilitiesBillingSection from '@/components/rentals/sections/RentalUtilitiesBillingSection';
import { useRentalUnitDetail } from '@/hooks/rentals/useRentalUnitDetail';
import {
  periodDateInputProps,
  RENTAL_DETAIL_INPUT_CLS,
} from '@/lib/rental-unit-detail-shared';

const RentalInvoiceModal = dynamic(() => import('@/components/rentals/RentalInvoiceModal'), { loading: () => null });
const RentalPaidModal = dynamic(() => import('@/components/rentals/RentalPaidModal'), { loading: () => null });
const RentalEndContractModal = dynamic(() => import('@/components/rentals/RentalEndContractModal'), { loading: () => null });
const RentalNoteModal = dynamic(() => import('@/components/rentals/RentalNoteModal'), { loading: () => null });
import {
  computeLeaseDisplayStatus,
  daysRemaining,
  displayRentalStatusForUnit,
  isLeaseFormallyEnded,
  isLeaseStaleEnded,
  isVirtualRentRecord,
  defaultRentInvoiceBody,
  defaultRentInvoiceSubject,
  formatDueDayLabel,
  formatDisplayDate,
  formatMoney,
  fromFormDate,
  outstandingBalance,
  DEBIT_NOTE_COMPANY_CHOICES,
  debitNoteCompanyForUnit,
  buildDebitNotePaymentInstructionsText,
  debitNoteDueDate,
  formatDueDateChinese,
  resolveUnitBillingCompany,
  formatBillingPeriodLabel,
  pastLeaseStatusLabel,
  isVacantUnitName,
  type DebitNoteCompanyId,
  type DebitNotePaymentTemplateId,
} from '@/lib/rentals';

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
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const id = params.id as string;
  const viewLeaseId = sp.get('leaseId');

  const {
    period,
    setPeriod,
    data,
    loading,
    load,
    ensurePeriodRecord,
    tenantName,
    setTenantName,
    tenantContactName,
    setTenantContactName,
    tenantCompanyName,
    setTenantCompanyName,
    tenantNotes,
    setTenantNotes,
    tenantPhone,
    setTenantPhone,
    tenantEmail,
    setTenantEmail,
    dueDateDay,
    setDueDateDay,
    baseRent,
    setBaseRent,
    utilityBillingMode,
    setUtilityBillingMode,
    sharedMeterDeductionUnitIds,
    setSharedMeterDeductionUnitIds,
    billingCompany,
    setBillingCompany,
    leaseStartDate,
    setLeaseStartDate,
    leaseEndDate,
    setLeaseEndDate,
    depositAmount,
    setDepositAmount,
    unitAddress,
    setUnitAddress,
    tenantAddress,
    setTenantAddress,
    profileSaving,
    applyTenantFromList,
    addNewTenantName,
    saveProfile: persistProfile,
    baseRentPeriodFrom,
    setBaseRentPeriodFrom,
    baseRentPeriodTo,
    setBaseRentPeriodTo,
    waterFee,
    setWaterFee,
    waterPeriodFrom,
    setWaterPeriodFrom,
    waterPeriodTo,
    setWaterPeriodTo,
    electricityFee,
    setElectricityFee,
    electricityPeriodFrom,
    setElectricityPeriodFrom,
    electricityPeriodTo,
    setElectricityPeriodTo,
    meterPrevReading,
    setMeterPrevReading,
    meterCurrReading,
    setMeterCurrReading,
    otherUnitUsages,
    setOtherUnitUsages,
    meterRatePerUnit,
    setMeterRatePerUnit,
    waterMeterPrev,
    setWaterMeterPrev,
    waterMeterCurr,
    setWaterMeterCurr,
    waterMeterRate,
    setWaterMeterRate,
    suggestedPrevReading,
    suggestedPrevWaterReading,
    utilityNote,
    setUtilityNote,
    utilitySaveState,
    utilityCanUndo,
    showUtilityFees,
    electricityFormula,
    waterMeterFormula,
    calcBasicRentPeriod,
    buildUtilityPayload,
    undoUtilitySave,
    liveElectricityFee,
    liveWaterFee,
  } = useRentalUnitDetail({
    unitId: id,
    initialPeriod: sp.get('period') || undefined,
    viewLeaseId,
  });

  // invoice modal
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoiceNote, setInvoiceNote] = useState('');
  const [invoicePaymentTemplate, setInvoicePaymentTemplate] = useState<DebitNotePaymentTemplateId>('label');
  const [invoicePaymentRemark, setInvoicePaymentRemark] = useState('');
  const [invoiceTo, setInvoiceTo] = useState('');
  const [invoiceSubject, setInvoiceSubject] = useState('');
  const [invoiceBody, setInvoiceBody] = useState('');

  // paid modal
  const [showPaidModal, setShowPaidModal] = useState(false);

  // activity note modal
  const [showNoteModal, setShowNoteModal] = useState(false);

  // end contract modal
  const [showEndContractModal, setShowEndContractModal] = useState(false);
  const [leaseDocUploading, setLeaseDocUploading] = useState(false);
  const leaseDocInputRef = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState(false);
  const [deletingPaymentId, setDeletingPaymentId] = useState<number | null>(null);
  const [toast, setToast] = useState('');

  const saveProfile = async () => {
    const ok = await persistProfile();
    if (ok) setToast('Profile saved');
  };

  const sendInvoice = async () => {
    if (!data?.currentRecord) return;
    if (!invoiceTo.trim()) {
      setToast(bi('Add a recipient email before sending', '請先填寫收件電郵'));
      return;
    }
    setBusy(true);
    const recordId = await ensurePeriodRecord();
    if (!recordId) {
      setBusy(false);
      setToast('Failed to prepare billing period');
      return;
    }
    const res = await fetch(`/api/rentals/records/${recordId}/invoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...buildUtilityPayload(),
        note: invoiceNote || null,
        paymentTemplate: invoicePaymentTemplate,
        paymentRemark: invoicePaymentRemark || null,
        to: invoiceTo.trim(),
        subject: invoiceSubject.trim(),
        body: invoiceBody,
      }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setToast(d.error || bi('Failed to send invoice', '租金單發送失敗'));
      return;
    }
    setToast(
      d.sent
        ? bi(`Invoice sent to ${d.to || invoiceTo}`, `已向 ${d.to || invoiceTo} 發送租金單`)
        : bi('Invoice prepared (email not sent)', '租金單已準備（電郵未發送）'),
    );
    setShowInvoiceModal(false);
    load();
  };

  const openPaidModal = () => {
    if (!data?.unit.tenantId || data.readOnlyLease || data.isHistoricalView) return;
    setShowPaidModal(true);
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

  const deleteLeaseRecord = async (leaseId: number, tenantLabel: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(bi(`Delete lease record for ${tenantLabel}? This cannot be undone.`, `刪除 ${tenantLabel} 的租約紀錄？此操作無法復原。`))) {
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/rentals/leases/${leaseId}`, { method: 'DELETE' });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setToast(d.error || bi('Failed to delete lease record', '刪除租約紀錄失敗'));
      return;
    }
    setToast(bi('Lease record deleted', '租約紀錄已刪除'));
    if (viewLeaseId === String(leaseId)) {
      router.push(`/rentals/${id}?period=${period}`);
      return;
    }
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
    setToast(res.ok ? MSG.documentUploaded : MSG.uploadFailed);
    load();
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="page-header">
          <div>
            <div className="h-8 w-56 bg-gray-200 rounded animate-pulse" />
            <div className="h-4 w-72 bg-gray-100 rounded mt-2 animate-pulse" />
          </div>
        </div>
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="h-48 bg-gray-100 rounded-xl animate-pulse" />
            <div className="h-64 bg-gray-100 rounded-xl animate-pulse" />
          </div>
          <div className="h-96 bg-gray-100 rounded-xl animate-pulse" />
        </div>
      </AppLayout>
    );
  }
  if (!data) return <AppLayout><div className="p-12 text-center text-gray-500">{bi('Unit not found.', '找不到單位。')} <button onClick={() => router.push('/rentals')} className="text-brand-600 underline">{BTN.back}</button></div></AppLayout>;

  const { unit, currentRecord, activities, currentLease, leaseHistory, leaseDocuments, paymentLedger, viewingLease, readOnlyLease, isHistoricalView } = data;
  const rec = currentRecord;
  const remaining = daysRemaining(unit.leaseEndDate);
  const recStatus = rec
    ? displayRentalStatusForUnit(unit, rec, currentLease, { dueDateDay: unit.dueDateDay, period: rec.billingPeriod || period })
    : 'vacant';
  const balance = rec ? outstandingBalance(rec) : 0;
  const hasPersistedRecord = Boolean(rec && !isVirtualRentRecord(rec));
  const readOnly = Boolean(readOnlyLease);
  const inp = RENTAL_DETAIL_INPUT_CLS;
  const fieldCls = readOnly
    ? 'w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-100 text-gray-600 cursor-not-allowed'
    : inp;
  const leaseStatus = isHistoricalView && viewingLease
    ? computeLeaseDisplayStatus(viewingLease)
    : currentLease
      ? computeLeaseDisplayStatus(currentLease)
      : !isVacantUnitName(unit.tenantName) ? 'active' : 'vacant';
  const formallyEnded = currentLease ? isLeaseFormallyEnded(currentLease) : false;
  const staleEnded = currentLease ? isLeaseStaleEnded(currentLease) : false;
  const contractEnded = readOnly || formallyEnded || staleEnded;
  const autoRentPeriod = calcBasicRentPeriod(Number(dueDateDay) || 1);
  const previousTenants = (leaseHistory || []).filter((l) => !l.isCurrent);
  const liveMonthTotal = (Number(baseRent) || rec?.baseRent || 0) + liveWaterFee + liveElectricityFee;

  return (
    <AppLayout>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-3">
        <button onClick={() => router.push('/rentals')} className="text-sm text-brand-600 font-medium min-h-[44px] sm:min-h-0 text-left">← {bi('Back to Rentals', '返回租金管理')}</button>
        <label className="flex flex-col gap-0.5 w-full sm:w-auto">
          <span className="text-xs font-medium text-gray-500">{bi('Billing period', '帳期')}</span>
          <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className={`${inp} w-full sm:w-auto`} />
        </label>
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
            ← {bi('Back to current unit', '返回現任租約')}
          </Link>
        </div>
      )}

      {staleEnded && !isHistoricalView && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {bi(
            'Lease end date has passed. Use',
            '租約已到期。請使用',
          )}{' '}
          <strong>{bi('End Contract', '完約')}</strong>{' '}
          {bi('to archive this tenancy and mark the unit vacant or start a new lease.', '封存租約，並將單位標記為空置或開始新租約。')}
        </div>
      )}

      {readOnly && !isHistoricalView && !staleEnded && (
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
            {currentLease?.isCurrent && !formallyEnded && !isHistoricalView && (
              <button
                type="button"
                onClick={() => setShowEndContractModal(true)}
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
                <button
                  type="button"
                  onClick={openPaidModal}
                  className="px-5 py-2.5 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700"
                >
                  ✓ Record Payment 記錄收款
                </button>
                <DebitNoteActions
                  tenantId={unit.tenantId}
                  unitId={unit.id}
                  unitName={unit.unitName}
                  period={period}
                />
              </>
            ) : !readOnly && !isHistoricalView ? (
              <p className="text-xs text-amber-600 self-center">{MSG.saveTenantForNotice}</p>
            ) : null}
          </div>
        </div>
        <div className={`grid md:grid-cols-2 lg:grid-cols-3 gap-4 ${readOnly ? 'opacity-90' : ''}`}>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Tenant Name 租單位人士</label>
            <TenantSelect
              value={tenantName}
              onSelect={applyTenantFromList}
              onAddNew={addNewTenantName}
              placeholder={bi('Select or add tenant…', '選擇或新增租客…')}
              disabled={readOnly || isHistoricalView}
              className={readOnly ? 'opacity-100' : ''}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Phone 電話</label>
            <input type="tel" className={fieldCls} value={tenantPhone} onChange={(e) => setTenantPhone(e.target.value)} placeholder="+852…" disabled={readOnly} readOnly={readOnly} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Email 電郵</label>
            <input type="email" className={fieldCls} value={tenantEmail} onChange={(e) => setTenantEmail(e.target.value)} placeholder="tenant@email.com" disabled={readOnly} readOnly={readOnly} />
          </div>
          <div className="md:col-span-2 lg:col-span-3">
            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">聯絡人姓名</label>
                <input className={fieldCls} value={tenantContactName} onChange={(e) => setTenantContactName(e.target.value)} disabled={readOnly} readOnly={readOnly} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">公司名稱</label>
                <input className={fieldCls} value={tenantCompanyName} onChange={(e) => setTenantCompanyName(e.target.value)} disabled={readOnly} readOnly={readOnly} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">備註</label>
                <input className={fieldCls} value={tenantNotes} onChange={(e) => setTenantNotes(e.target.value)} disabled={readOnly} readOnly={readOnly} />
              </div>
            </div>
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
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">單位地址</label>
                <textarea
                  className={`${fieldCls} min-h-[72px] resize-y`}
                  value={unitAddress}
                  onChange={(e) => setUnitAddress(e.target.value)}
                  placeholder="Unit premises address"
                  rows={2}
                  disabled={readOnly}
                  readOnly={readOnly}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">租客地址</label>
                <textarea
                  className={`${fieldCls} min-h-[72px] resize-y`}
                  value={tenantAddress}
                  onChange={(e) => setTenantAddress(e.target.value)}
                  placeholder="Tenant mailing address"
                  rows={2}
                  disabled={readOnly}
                  readOnly={readOnly}
                />
              </div>
            </div>
          </div>
          <div className="md:col-span-2 lg:col-span-2">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">起租日 Lease Start 租期</label>
                <input {...periodDateInputProps(leaseStartDate, setLeaseStartDate, fieldCls, readOnly)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">完租日 Lease End 租期</label>
                <input {...periodDateInputProps(leaseEndDate, setLeaseEndDate, fieldCls, readOnly)} />
              </div>
            </div>
          </div>
        </div>
        {!readOnly && (
        <div className="mt-6 pt-5 border-t border-gray-100">
          <label className="block text-xs font-medium text-gray-500 mb-2">Debit note company 繳費通知單公司</label>
          <p className="text-xs text-gray-400 mb-3">
            Select which company heading and template apply to this unit. Auto uses unit name rules (204/205 → Label; 213A/213B/214/Stock → Elite).
          </p>
          <select
            className={fieldCls}
            value={billingCompany}
            onChange={(e) => setBillingCompany(e.target.value as DebitNoteCompanyId | '')}
          >
            <option value="">
              Auto — {DEBIT_NOTE_COMPANY_CHOICES.find((c) => c.id === resolveUnitBillingCompany({ unitName: data?.unit.unitName || '', billingCompany: null }))?.label}
            </option>
            {DEBIT_NOTE_COMPANY_CHOICES.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>
        )}
        {!readOnly && (
        <div className="mt-6 pt-5 border-t border-gray-100">
          <label className="block text-xs font-medium text-gray-500 mb-2">水電費安排 Utility Billing</label>
          <p className="text-xs text-gray-400 mb-3">Controls whether water &amp; electricity appear on debit notes for this unit</p>
          <UtilityBillingPicker
            value={utilityBillingMode}
            onChange={(mode) => {
              setUtilityBillingMode(mode);
              if (mode !== 'company_shared_meter') setSharedMeterDeductionUnitIds([]);
            }}
          />
          {utilityBillingMode === 'company_shared_meter' && (
            <div className="mt-3 rounded-lg border border-orange-100 bg-orange-50/40 p-3">
              <p className="text-xs font-semibold text-orange-900 mb-2">
                {bi('Other units’ electric dials to deduct', '需扣除的其他單位電錶度數')}
              </p>
              <div className="grid sm:grid-cols-2 gap-2">
                {(data?.portfolioUnits || [])
                  .filter((u) => u.id !== data?.unit.id)
                  .map((u) => {
                    const checked = sharedMeterDeductionUnitIds.includes(u.id);
                    return (
                      <label key={u.id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setSharedMeterDeductionUnitIds((cur) =>
                              checked ? cur.filter((x) => x !== u.id) : [...cur, u.id],
                            );
                          }}
                        />
                        <span className="font-medium text-gray-800">{u.unitName}</span>
                      </label>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
        )}
        {!readOnly && (
        <div className="mt-4 flex justify-end">
          <button onClick={saveProfile} disabled={profileSaving} className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
            {profileSaving ? BTN.saving : bi('Save Profile', '儲存資料')}
          </button>
        </div>
        )}
      </div>

      <div className="grid lg:grid-cols-[1fr_340px] gap-6 lg:items-start">
        {/* LEFT */}
        <div className="space-y-6">
          {/* Utility / billing for current month */}
          {!isHistoricalView && (
            <RentalUtilitiesBillingSection
              period={period}
              readOnly={readOnly}
              rec={rec}
              baseRent={baseRent}
              dueDateDay={dueDateDay}
              showUtilityFees={showUtilityFees}
              electricityFormula={electricityFormula}
              waterMeterFormula={waterMeterFormula}
              fieldCls={fieldCls}
              inp={inp}
              autoRentPeriod={autoRentPeriod}
              baseRentPeriodFrom={baseRentPeriodFrom}
              setBaseRentPeriodFrom={setBaseRentPeriodFrom}
              baseRentPeriodTo={baseRentPeriodTo}
              setBaseRentPeriodTo={setBaseRentPeriodTo}
              waterFee={waterFee}
              setWaterFee={setWaterFee}
              waterPeriodFrom={waterPeriodFrom}
              setWaterPeriodFrom={setWaterPeriodFrom}
              waterPeriodTo={waterPeriodTo}
              setWaterPeriodTo={setWaterPeriodTo}
              electricityFee={electricityFee}
              setElectricityFee={setElectricityFee}
              electricityPeriodFrom={electricityPeriodFrom}
              setElectricityPeriodFrom={setElectricityPeriodFrom}
              electricityPeriodTo={electricityPeriodTo}
              setElectricityPeriodTo={setElectricityPeriodTo}
              meterPrevReading={meterPrevReading}
              setMeterPrevReading={setMeterPrevReading}
              meterCurrReading={meterCurrReading}
              setMeterCurrReading={setMeterCurrReading}
              meterRatePerUnit={meterRatePerUnit}
              setMeterRatePerUnit={setMeterRatePerUnit}
              otherUnitUsages={otherUnitUsages}
              setOtherUnitUsages={setOtherUnitUsages}
              waterMeterPrev={waterMeterPrev}
              setWaterMeterPrev={setWaterMeterPrev}
              waterMeterCurr={waterMeterCurr}
              setWaterMeterCurr={setWaterMeterCurr}
              waterMeterRate={waterMeterRate}
              setWaterMeterRate={setWaterMeterRate}
              suggestedPrevReading={suggestedPrevReading}
              suggestedPrevWaterReading={suggestedPrevWaterReading}
              sharedMeterDeductionUnits={data?.sharedMeterDeductionUnits || []}
              utilityNote={utilityNote}
              setUtilityNote={setUtilityNote}
              utilitySaveState={utilitySaveState}
              utilityCanUndo={utilityCanUndo}
              undoUtilitySave={undoUtilitySave}
              liveElectricityFee={liveElectricityFee}
              liveWaterFee={liveWaterFee}
              liveMonthTotal={liveMonthTotal}
              recStatus={recStatus}
              balance={balance}
            />
          )}

          {/* Action bar */}
          {!readOnly && !isHistoricalView && (rec || unit.tenantId) && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-900 mb-1">Actions 操作</h2>
              <p className="text-xs text-gray-500 mb-4">Official rental actions for this unit 單位正式操作</p>
              <div className="flex flex-wrap gap-3">
                {rec && (
                  <button onClick={() => {
                    const note = rec.customInvoiceNote || '';
                    const tpl = debitNoteCompanyForUnit(unit.unitName);
                    setInvoiceNote(note);
                    setInvoicePaymentTemplate(tpl);
                    setInvoicePaymentRemark('');
                    const draftRent = Number(baseRent) || rec.baseRent;
                    const draftWater = Number(waterFee) || 0;
                    const draftElec = Number(electricityFee) || 0;
                    const draftRecord = {
                      ...rec,
                      billingPeriod: period,
                      baseRent: draftRent,
                      waterFee: draftWater,
                      electricityFee: draftElec,
                      actualAmount: draftRent + draftWater + draftElec,
                      baseRentPeriodFrom: fromFormDate(baseRentPeriodFrom),
                      baseRentPeriodTo: fromFormDate(baseRentPeriodTo),
                      waterPeriodFrom: fromFormDate(waterPeriodFrom),
                      waterPeriodTo: fromFormDate(waterPeriodTo),
                      electricityPeriodFrom: fromFormDate(electricityPeriodFrom),
                      electricityPeriodTo: fromFormDate(electricityPeriodTo),
                    };
                    const issued = new Date().toISOString().slice(0, 10);
                    const dueIso = debitNoteDueDate(issued);
                    const dueChinese = formatDueDateChinese(
                      formatDisplayDate(dueIso),
                      period.split('-')[0],
                    );
                    const noteNo = `INV-${period.replace('-', '')}-${rec.id || 'draft'}`;
                    const payText = buildDebitNotePaymentInstructionsText(
                      tpl,
                      noteNo,
                      dueChinese,
                      '',
                    );
                    setInvoiceTo(unit.tenantEmail || '');
                    setInvoiceSubject(defaultRentInvoiceSubject(unit.unitName, period));
                    setInvoiceBody(defaultRentInvoiceBody({
                      tenantName: unit.tenantName,
                      unitName: unit.unitName,
                      record: draftRecord,
                      dueDateDay: Number(dueDateDay) || unit.dueDateDay || 1,
                      note,
                      paymentInstructionsText: payText,
                    }));
                    setShowInvoiceModal(true);
                  }}
                    disabled={contractEnded}
                    className="px-5 py-2.5 bg-brand-600 text-white rounded-lg text-sm font-semibold hover:bg-brand-700 disabled:opacity-40">
                    📄 {bi('Send Invoice', '發送租金單')}
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
                {rec?.receiptRef && hasPersistedRecord && (
                  <Link href={`/rentals/records/${rec.id}/receipt`}
                    className="px-5 py-2.5 border border-gray-300 rounded-lg text-sm font-semibold hover:bg-gray-50">
                    🧾 {bi('View Receipt', '查看收據')}
                  </Link>
                )}
                {rec?.invoiceRef && hasPersistedRecord && (
                  <Link href={`/rentals/records/${rec.id}/invoice`}
                    className="px-5 py-2.5 border border-gray-300 rounded-lg text-sm font-semibold hover:bg-gray-50">
                    🖨 {bi('View Invoice', '查看發票')}
                  </Link>
                )}
                <button onClick={() => setShowNoteModal(true)}
                  className="px-5 py-2.5 border border-gray-300 rounded-lg text-sm font-semibold hover:bg-gray-50">
                  📝 {bi('Add Note', '新增備註')}
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
              <p className="text-sm text-gray-400 text-center py-8">{MSG.noActivityYet}</p>
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
              {isHistoricalView ? bi('Viewing archived tenancy — select another row or return to current', '正在查看封存租約 — 選擇其他列或返回現任租約') : bi('Click a completed tenancy to view read-only records', '點擊已完約租期以查看唯讀紀錄')}
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
                  {isAdmin && <th className="px-4 py-3 text-right">Action</th>}
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
                    {isAdmin && (
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={(e) => deleteLeaseRecord(l.id, l.tenantName, e)}
                          className="text-xs font-medium text-red-600 hover:text-red-800 hover:underline disabled:opacity-50"
                        >
                          {bi('Delete', '刪除')}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {previousTenants.length === 0 && (
                  <tr>
                    <td colSpan={isAdmin ? 7 : 6} className="px-4 py-8 text-center text-gray-400 text-sm">
                      {bi('No previous tenants for this unit yet.', '此單位尚無歷任租客。')}
                      {!currentLease && <span className="block mt-1 text-xs">{bi('Use', '請使用')} <strong>{bi('End Contract', '完約')}</strong> {bi('when a tenant moves out.', '於租客遷出時封存租約。')}</span>}
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
                  {leaseDocUploading ? MSG.uploading : `+ ${bi('Upload', '上傳')}`}
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
                  <span className="text-xs text-brand-600">{BTN.view}</span>
                </a>
              ))
            )}
          </div>
        </div>
      </div>

      <RentalInvoiceModal
        open={Boolean(showInvoiceModal && rec)}
        rec={rec!}
        unit={unit}
        period={period}
        baseRent={baseRent}
        waterFee={waterFee}
        electricityFee={electricityFee}
        waterPeriodFrom={waterPeriodFrom}
        waterPeriodTo={waterPeriodTo}
        electricityPeriodFrom={electricityPeriodFrom}
        electricityPeriodTo={electricityPeriodTo}
        baseRentPeriodFrom={baseRentPeriodFrom}
        baseRentPeriodTo={baseRentPeriodTo}
        invoiceTo={invoiceTo}
        setInvoiceTo={setInvoiceTo}
        invoiceSubject={invoiceSubject}
        setInvoiceSubject={setInvoiceSubject}
        invoiceBody={invoiceBody}
        setInvoiceBody={setInvoiceBody}
        invoiceNote={invoiceNote}
        setInvoiceNote={setInvoiceNote}
        invoicePaymentTemplate={invoicePaymentTemplate}
        setInvoicePaymentTemplate={setInvoicePaymentTemplate}
        invoicePaymentRemark={invoicePaymentRemark}
        setInvoicePaymentRemark={setInvoicePaymentRemark}
        hasPersistedRecord={hasPersistedRecord}
        busy={busy}
        onClose={() => setShowInvoiceModal(false)}
        onSend={() => void sendInvoice()}
      />

      <RentalPaidModal
        open={showPaidModal}
        unit={unit}
        period={period}
        outstandingCharges={data.outstandingCharges || []}
        monthlyRent={data.unit.currentYearRent || Number(baseRent) || data.paymentLedger?.find((h) => h.baseRent > 0)?.baseRent || 0}
        hasCurrentRecord={Boolean(data.currentRecord)}
        ensurePeriodRecord={ensurePeriodRecord}
        onClose={() => setShowPaidModal(false)}
        onSaved={(msg) => {
          setToast(msg);
          load();
        }}
        onError={setToast}
      />

      <RentalEndContractModal
        open={showEndContractModal}
        unitId={id}
        tenantName={unit.tenantName}
        baseRent={baseRent}
        dueDateDay={dueDateDay}
        defaultNewBaseRent={String(unit.currentYearRent || '')}
        onClose={() => setShowEndContractModal(false)}
        onDone={(msg) => {
          setToast(msg);
          load();
        }}
        onError={setToast}
      />

      <RentalNoteModal
        open={showNoteModal}
        unitId={id}
        onClose={() => setShowNoteModal(false)}
        onSaved={load}
      />
    </AppLayout>
  );
}
