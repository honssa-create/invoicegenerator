'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import { useModalUnsavedWarning } from '@/hooks/useUnsavedChangesWarning';
import { BTN, MSG, bi } from '@/lib/ui-labels';
import LeaseStatusBadge from '@/components/LeaseStatusBadge';
import RentPaymentNoticeMatrix from '@/components/RentPaymentNoticeMatrix';
import PaymentHistoryTable from '@/components/PaymentHistoryTable';
import PaymentPeriodTable, {
  emptyPaymentPeriodLine,
  sumPaymentPeriodLine,
  sumPaymentPeriodLines,
  type PaymentPeriodLine,
} from '@/components/PaymentPeriodTable';
import PaymentAllocationLedger from '@/components/PaymentAllocationLedger';
import { useAuth } from '@/components/AuthProvider';
import {
  CHARGE_TYPE_LABELS,
  CHARGE_STATUS_LABELS,
  RENTAL_STATUS_BADGE,
  RENTAL_STATUS_LABELS,
  addBillingMonths,
  chargeOutstanding,
  computeLeaseDisplayStatus,
  currentBillingPeriod,
  formatDisplayDate,
  formatMoney,
  formatUtilityAmount,
  todayFormDate,
  RENTAL_PAYMENT_METHODS,
  RENTAL_PAYMENT_METHOD_LABELS,
  type RentalChargeItem,
  type RentalChargeType,
  type RentalPayment,
  type RentalPaymentAllocationDetail,
  type RentalPaymentWithAllocations,
  type RentalTenant,
  type RentPaymentNoticeMatrix as MatrixType,
  type TenantBillingHistoryRow,
  type TenantLeaseHistoryRow,
  type TenantProfileSummary,
} from '@/lib/rentals';

function tenantChargeTypeTotal(
  charges: RentalChargeItem[],
  unitId: number,
  billingPeriod: string,
  chargeType: RentalChargeType,
): number {
  return charges
    .filter((c) => c.unitId === unitId && c.billingPeriod === billingPeriod && c.chargeType === chargeType)
    .reduce((s, c) => s + chargeOutstanding(c), 0);
}

function formatBreakdownAmount(amount: number): string {
  return amount > 0 ? String(amount) : '';
}

interface TenantDetail {
  tenant: RentalTenant;
  units: { id: number; unitName: string; tenantName: string; currentYearRent?: number }[];
  outstandingCharges: RentalChargeItem[];
  payments: RentalPayment[];
  paymentsWithAllocations: RentalPaymentWithAllocations[];
  allocationLedger: RentalPaymentAllocationDetail[];
  billingHistory: TenantBillingHistoryRow[];
  leaseHistory: TenantLeaseHistoryRow[];
  summary: TenantProfileSummary;
}

export default function TenantDetailPage() {
  const { id } = useParams();
  const { isSectionReadOnly, user } = useAuth();
  const readOnly = isSectionReadOnly('rentals');
  const isAdmin = user?.role === 'admin';
  const [period, setPeriod] = useState(currentBillingPeriod());
  const [fromPeriod, setFromPeriod] = useState(''); // optional override; auto-detect arrears when empty
  const [paidLookback, setPaidLookback] = useState(2);
  const [detail, setDetail] = useState<TenantDetail | null>(null);
  const [matrix, setMatrix] = useState<MatrixType | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [deletingPaymentId, setDeletingPaymentId] = useState<number | null>(null);
  const [paymentModal, setPaymentModal] = useState(false);
  const [allocateModal, setAllocateModal] = useState<RentalPayment | null>(null);
  const [paymentForm, setPaymentForm] = useState({ paymentDate: todayFormDate(), amount: '', method: '', reference: '', notes: '' });
  const [allocations, setAllocations] = useState<Record<number, string>>({});
  const [selectedUnitIds, setSelectedUnitIds] = useState<number[]>([]);
  const [contactForm, setContactForm] = useState({
    name: '', contact_name: '', company_name: '', phone: '', email: '', address: '', notes: '',
  });
  const [contactSaving, setContactSaving] = useState(false);
  const [contactEditing, setContactEditing] = useState(false);
  const [periodRows, setPeriodRows] = useState<PaymentPeriodLine[]>([]);

  useModalUnsavedWarning(contactEditing, contactForm, !readOnly);
  useModalUnsavedWarning(paymentModal, { paymentForm, periodRows }, !readOnly);
  useModalUnsavedWarning(Boolean(allocateModal), allocations, !readOnly);

  const load = () => {
    setLoading(true);
    setLoadError('');
    Promise.all([
      fetch(`/api/rentals/tenants/${id}`).then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Tenant not found');
        return data;
      }),
      fetch(`/api/rentals/tenants/${id}/rent-payment-notice?period=${period}${fromPeriod ? `&from=${fromPeriod}` : ''}&paid_lookback=${paidLookback}`).then(async (r) => {
        const data = await r.json();
        if (!r.ok) return null;
        return data;
      }),
    ])
      .then(([d, m]) => {
        if (d.tenant) {
          setDetail(d);
          setContactForm({
            name: d.tenant.name || '',
            contact_name: d.tenant.contact_name || '',
            company_name: d.tenant.company_name || '',
            phone: d.tenant.phone || '',
            email: d.tenant.email || '',
            address: d.tenant.address || '',
            notes: d.tenant.notes || '',
          });
          setSelectedUnitIds((prev) => {
            if (prev.length && d.units?.every((u: { id: number }) => prev.includes(u.id))) return prev;
            return (d.units || []).map((u: { id: number }) => u.id);
          });
        }
        if (m?.tenant) setMatrix(m);
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Failed to load tenant'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id, period, fromPeriod, paidLookback]);

  const saveContact = async () => {
    if (!detail) return;
    setContactSaving(true);
    const res = await fetch(`/api/rentals/tenants/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(contactForm),
    });
    setContactSaving(false);
    if (!res.ok) {
      const d = await res.json();
      setToast(d.error || 'Failed to save contact details');
      return;
    }
    setContactEditing(false);
    setToast('Contact details saved');
    load();
  };

  const deleteLeaseRecord = async (leaseId: number, tenantLabel: string) => {
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
    load();
  };

  const applyPeriodRows = (rows: PaymentPeriodLine[]) => {
    setPeriodRows(rows);
    setPaymentForm((f) => ({ ...f, amount: String(sumPaymentPeriodLines(rows) || '') }));
  };

  const buildOutstandingPeriodRows = (): PaymentPeriodLine[] => {
    if (!detail) return [];
    const seen = new Set<string>();
    const rows: PaymentPeriodLine[] = [];
    const charges = [...detail.outstandingCharges]
      .filter((c) => chargeOutstanding(c) > 0)
      .sort((a, b) => a.billingPeriod.localeCompare(b.billingPeriod) || a.unitId - b.unitId);
    for (const c of charges) {
      const key = `${c.unitId}:${c.billingPeriod}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        unitId: c.unitId,
        billingPeriod: c.billingPeriod,
        rent: formatBreakdownAmount(tenantChargeTypeTotal(charges, c.unitId, c.billingPeriod, 'rent')),
        electricity: formatBreakdownAmount(tenantChargeTypeTotal(charges, c.unitId, c.billingPeriod, 'electricity')),
        water: formatBreakdownAmount(tenantChargeTypeTotal(charges, c.unitId, c.billingPeriod, 'water')),
      });
    }
    return rows;
  };

  const openPaymentModal = () => {
    if (!detail) return;
    const outstanding = buildOutstandingPeriodRows();
    const unitId = selectedUnitIds[0] || detail.units[0]?.id;
    applyPeriodRows(outstanding.length ? outstanding : [emptyPaymentPeriodLine({ unitId, billingPeriod: currentBillingPeriod() })]);
    setPaymentModal(true);
  };

  const startPeriodForUnit = (unitId: number) => {
    if (!detail) return currentBillingPeriod();
    const periods = detail.outstandingCharges
      .filter((c) => c.unitId === unitId && chargeOutstanding(c) > 0)
      .map((c) => c.billingPeriod)
      .sort();
    return periods[0] || currentBillingPeriod();
  };

  const monthlyRentForUnit = (unitId: number) => {
    const u = detail?.units.find((x) => x.id === unitId);
    if (u?.currentYearRent) return u.currentYearRent;
    const hist = detail?.billingHistory?.find((h) => h.unitId === unitId);
    return hist?.baseRent || 0;
  };

  const fillOutstandingPeriodRows = () => {
    const rows = buildOutstandingPeriodRows();
    applyPeriodRows(rows.length ? rows : [emptyPaymentPeriodLine({
      unitId: selectedUnitIds[0] || detail?.units[0]?.id,
      billingPeriod: currentBillingPeriod(),
    })]);
  };

  const fillAdvanceMonths = (months: number) => {
    if (!detail) return;
    const targetUnits = detail.units.filter((u) => selectedUnitIds.includes(u.id));
    const unitsToFill = targetUnits.length ? targetUnits : detail.units;
    const rows: PaymentPeriodLine[] = [];
    for (const u of unitsToFill) {
      let p = startPeriodForUnit(u.id);
      const rent = monthlyRentForUnit(u.id);
      for (let i = 0; i < months; i += 1) {
        rows.push({
          unitId: u.id,
          billingPeriod: p,
          rent: rent ? String(rent) : '',
          electricity: '',
          water: '',
        });
        p = addBillingMonths(p, 1);
      }
    }
    applyPeriodRows(rows);
  };

  const savePayment = async () => {
    if (!detail) return;
    const amount = Number(paymentForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setToast('Enter a valid payment amount');
      return;
    }

    const body: Record<string, unknown> = {
      tenantId: detail.tenant.id,
      paymentDate: paymentForm.paymentDate,
      amount,
      method: paymentForm.method || null,
      reference: paymentForm.reference || null,
      notes: paymentForm.notes || null,
      unitIds: selectedUnitIds.length ? selectedUnitIds : undefined,
    };

    const periodAllocations = periodRows
      .filter((r) => r.billingPeriod && sumPaymentPeriodLine(r) > 0)
      .map((r) => ({
        unitId: r.unitId,
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

    setBusy(true);
    const res = await fetch('/api/rentals/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json();
      setToast(d.error || 'Failed to record payment');
      return;
    }
    setPaymentModal(false);
    setPeriodRows([]);
    setPaymentForm({ paymentDate: todayFormDate(), amount: '', method: '', reference: '', notes: '' });
    setToast('Payment recorded — outstanding balance updated');
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
      setToast('Payment deleted — records updated');
      load();
    } catch {
      setToast('Failed to delete payment');
    } finally {
      setDeletingPaymentId(null);
    }
  };

  const inp = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm';

  if (loading && !detail) {
    return <AppLayout><div className="p-12 text-center text-gray-400">{BTN.loading}</div></AppLayout>;
  }
  if (loadError || !detail) {
    return (
      <AppLayout>
        <div className="p-12 text-center">
          <p className="text-gray-500">{loadError || 'Tenant not found'}</p>
          <Link href="/rentals" className="text-brand-600 text-sm font-medium mt-3 inline-block">← {bi('Back to Rentals', '返回租金管理')}</Link>
        </div>
      </AppLayout>
    );
  }

  const {
    tenant,
    units,
    outstandingCharges,
    payments,
    paymentsWithAllocations,
    allocationLedger,
    billingHistory,
    leaseHistory = [],
    summary: rawSummary,
  } = detail;

  const summary: TenantProfileSummary = rawSummary ?? {
    activeUnits: units.length,
    contractCount: leaseHistory.length,
    totalPaid: payments.reduce((s, p) => s + (p.amount || 0), 0),
    totalOutstanding: outstandingCharges.reduce((s, c) => s + chargeOutstanding(c), 0),
    lastPaymentDate: payments[0]?.paymentDate ?? null,
  };

  const openAllocate = (payment: RentalPayment) => {
    const p = payments.find((x) => x.id === payment.id) || payment;
    setAllocateModal(p);
    const init: Record<number, string> = {};
    for (const c of outstandingCharges) {
      init[c.id] = '';
    }
    setAllocations(init);
  };

  const saveAllocation = async () => {
    if (!allocateModal) return;
    const items = Object.entries(allocations)
      .filter(([, v]) => v && Number(v) > 0)
      .map(([chargeItemId, amount]) => ({ chargeItemId: Number(chargeItemId), amount: Number(amount) }));
    if (!items.length) { setToast('Enter at least one allocation amount'); return; }
    setBusy(true);
    const res = await fetch(`/api/rentals/payments/${allocateModal.id}/allocate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allocations: items }),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json();
      setToast(d.error || MSG.allocationFailed);
      return;
    }
    setAllocateModal(null);
    setToast('Payment allocated');
    load();
  };

  const toggleUnit = (unitId: number) => {
    setSelectedUnitIds((prev) =>
      prev.includes(unitId) ? prev.filter((id) => id !== unitId) : [...prev, unitId],
    );
  };

  const debitNoteHref = () => {
    const qs = new URLSearchParams({
      tenantId: String(id),
      targetPeriod: period,
      mode: 'grouped',
      paid_lookback: String(paidLookback),
    });
    if (fromPeriod) qs.set('from', fromPeriod);
    if (selectedUnitIds.length && selectedUnitIds.length < units.length) {
      qs.set('unitIds', selectedUnitIds.join(','));
    }
    return `/billing/debit-note?${qs}`;
  };

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <Link href="/rentals" className="text-sm text-brand-600 hover:text-brand-700">← Rentals</Link>
          <p className="text-[11px] uppercase tracking-widest text-brand-600 font-semibold mt-2">租客檔案 Tenant Profile</p>
          <h1 className="page-title mt-0.5">{tenant.name}</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {summary.activeUnits} active unit{summary.activeUnits !== 1 ? 's' : ''}
            {summary.contractCount > 0 && ` · ${summary.contractCount} contract${summary.contractCount !== 1 ? 's' : ''}`}
            {readOnly && <span className="ml-2 text-amber-600">(Read-only)</span>}
          </p>
        </div>
        <div className="page-actions flex-wrap items-end">
          <label className="flex flex-col gap-0.5">
            <span className="text-xs font-medium text-gray-500">{bi('From period', '起始帳期')}</span>
            <input type="month" value={fromPeriod} onChange={(e) => setFromPeriod(e.target.value)} className={`${inp} w-auto`} />
          </label>
          <span className="text-gray-400 self-end pb-2">→</span>
          <label className="flex flex-col gap-0.5">
            <span className="text-xs font-medium text-gray-500">{bi('Target period', '目標帳期')}</span>
            <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className={`${inp} w-auto`} />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-xs font-medium text-gray-500">{bi('Paid lookback (months)', '已付回溯月數')}</span>
            <input type="number" min={0} max={12} value={paidLookback} onChange={(e) => setPaidLookback(Number(e.target.value) || 0)} className={`${inp} w-16`} />
          </label>
          {selectedUnitIds.length ? (
            <Link
              href={debitNoteHref()}
              className="btn border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              繳費通知單 Debit Note
            </Link>
          ) : (
            <button
              type="button"
              disabled
              className="btn border border-gray-300 text-gray-700 opacity-40 cursor-not-allowed"
            >
              繳費通知單 Debit Note
            </button>
          )}
          {!readOnly && (
            <button onClick={openPaymentModal} className="btn bg-brand-600 text-white hover:bg-brand-700">
              + Record Payment
            </button>
          )}
        </div>
      </div>

      {toast && (
        <div onClick={() => setToast('')} className="mb-4 p-3 rounded-lg bg-brand-50 text-brand-700 text-sm cursor-pointer">{toast} ✕</div>
      )}

      {/* Contact details */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-gray-900">聯絡資料 Contact Details</h2>
            <p className="text-xs text-gray-500 mt-0.5">Phone, email and notes for this tenant</p>
          </div>
          {!readOnly && !contactEditing && (
            <button
              type="button"
              onClick={() => setContactEditing(true)}
              className="text-xs px-3 py-1.5 border rounded-lg hover:bg-gray-50"
            >
              {BTN.edit}
            </button>
          )}
        </div>
        <div className="p-6">
          {contactEditing ? (
            <div className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Tenant Name 租單位人士</label>
                  <input className={inp} value={contactForm.name} onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">聯絡人姓名</label>
                  <input className={inp} value={contactForm.contact_name} onChange={(e) => setContactForm({ ...contactForm, contact_name: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">公司名稱</label>
                  <input className={inp} value={contactForm.company_name} onChange={(e) => setContactForm({ ...contactForm, company_name: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Phone 電話</label>
                  <input type="tel" className={inp} value={contactForm.phone} onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })} placeholder="+852…" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Email 電郵</label>
                  <input type="email" className={inp} value={contactForm.email} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">租客地址</label>
                <textarea
                  className={`${inp} min-h-[72px] resize-y`}
                  value={contactForm.address}
                  onChange={(e) => setContactForm({ ...contactForm, address: e.target.value })}
                  rows={2}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Notes 備註</label>
                <textarea className={`${inp} min-h-[80px]`} value={contactForm.notes} onChange={(e) => setContactForm({ ...contactForm, notes: e.target.value })} placeholder="Emergency contact, ID reference, etc." />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setContactEditing(false);
                    setContactForm({
                      name: tenant.name || '',
                      contact_name: tenant.contact_name || '',
                      company_name: tenant.company_name || '',
                      phone: tenant.phone || '',
                      email: tenant.email || '',
                      address: tenant.address || '',
                      notes: tenant.notes || '',
                    });
                  }}
                  className="px-4 py-2 border rounded-lg text-sm"
                >
                  {BTN.cancel}
                </button>
                <button
                  type="button"
                  onClick={saveContact}
                  disabled={contactSaving}
                  className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm disabled:opacity-50"
                >
                  {contactSaving ? BTN.saving : BTN.save}
                </button>
              </div>
            </div>
          ) : (
            <dl className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
              <div>
                <dt className="text-xs text-gray-500 uppercase">Tenant Name 租單位人士</dt>
                <dd className="mt-1 font-medium text-gray-900">{tenant.name || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500 uppercase">聯絡人姓名</dt>
                <dd className="mt-1 font-medium text-gray-900">{tenant.contact_name || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500 uppercase">公司名稱</dt>
                <dd className="mt-1 font-medium text-gray-900">{tenant.company_name || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500 uppercase">Phone 電話</dt>
                <dd className="mt-1 font-medium text-gray-900">{tenant.phone || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500 uppercase">Email 電郵</dt>
                <dd className="mt-1 font-medium text-gray-900 break-all">{tenant.email || '—'}</dd>
              </div>
              <div className="sm:col-span-2 lg:col-span-4">
                <dt className="text-xs text-gray-500 uppercase">租客地址</dt>
                <dd className="mt-1 font-medium text-gray-900 whitespace-pre-wrap">{tenant.address || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500 uppercase">Last Payment 最近交租</dt>
                <dd className="mt-1 font-medium text-gray-900">{formatDisplayDate(summary.lastPaymentDate) || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500 uppercase">Total Paid 累計收款</dt>
                <dd className="mt-1 font-medium text-green-700">{formatMoney(summary.totalPaid)}</dd>
              </div>
              {tenant.notes && (
                <div className="sm:col-span-2 lg:col-span-4">
                  <dt className="text-xs text-gray-500 uppercase">Notes 備註</dt>
                  <dd className="mt-1 text-gray-700 whitespace-pre-wrap">{tenant.notes}</dd>
                </div>
              )}
            </dl>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase">Units 單位</p>
          <p className="text-2xl font-bold mt-1">{summary.activeUnits}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase">Contracts 租約</p>
          <p className="text-2xl font-bold mt-1">{summary.contractCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase">Outstanding 未付</p>
          <p className="text-2xl font-bold mt-1 text-red-700">{formatMoney(summary.totalOutstanding)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase">Payments 收款</p>
          <p className="text-2xl font-bold mt-1">{payments.length}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-gray-900">Payment Records 收款紀錄</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Every payment received from this tenant — expand rows for unit / period breakdown
            </p>
          </div>
          {!readOnly && (
            <button onClick={openPaymentModal} className="text-xs px-3 py-1.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700">
              + Record Payment
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <PaymentHistoryTable
            payments={paymentsWithAllocations || []}
            readOnly={readOnly}
            onAllocate={(paymentId) => {
              const p = payments.find((x) => x.id === paymentId);
              if (p) openAllocate(p);
            }}
            onDelete={readOnly ? undefined : handleDeletePayment}
            deletingId={deletingPaymentId}
          />
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        {/* Units selection */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">Current Units 現租單位</h2>
            <p className="text-xs text-gray-500 mt-0.5">Select units for grouped debit note 合併繳費通知單</p>
          </div>
          <ul className="p-4 space-y-2">
            {units.map((u) => (
              <li key={u.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedUnitIds.includes(u.id)}
                  onChange={() => toggleUnit(u.id)}
                  className="h-4 w-4 rounded border-gray-300"
                  aria-label={bi(`Include ${u.unitName}`, `納入 ${u.unitName}`)}
                />
                <Link href={`/rentals/${u.id}`} className="text-brand-600 hover:underline font-medium">{u.unitName}</Link>
              </li>
            ))}
            {units.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">No active units linked</p>
            )}
          </ul>
        </div>

        {/* Contract history */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">Contract History 租約紀錄</h2>
            <p className="text-xs text-gray-500 mt-0.5">All past and current leases across units</p>
          </div>
          <div className="p-4 space-y-3 max-h-80 overflow-y-auto">
            {(leaseHistory).length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">{bi('No contract history yet', '尚無合約紀錄')}</p>
            ) : (
              leaseHistory.map((l) => (
                <div key={l.id} className={`rounded-xl border p-3 text-sm ${l.isCurrent ? 'border-brand-200 bg-brand-50/40' : 'border-gray-100'}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`/rentals/${l.unitId}`} className="font-semibold text-brand-700 hover:underline">{l.unitName}</Link>
                    <div className="flex items-center gap-2">
                      <LeaseStatusBadge status={computeLeaseDisplayStatus(l)} />
                      {isAdmin && !l.isCurrent && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => deleteLeaseRecord(l.id, l.tenantName || tenant.name)}
                          className="text-xs font-medium text-red-600 hover:text-red-800 hover:underline disabled:opacity-50"
                        >
                          {bi('Delete', '刪除')}
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {formatDisplayDate(l.leaseStartDate)} → {formatDisplayDate(l.actualEndDate || l.leaseEndDate)}
                    {l.isCurrent && <span className="ml-1 text-brand-600 font-medium">(Current)</span>}
                  </p>
                  <p className="text-xs text-gray-500">
                    Rent {formatMoney(l.baseRent)} · Deposit {formatMoney(l.depositAmount)}
                    {l.endReason && <span className="ml-1">· {l.endReason}</span>}
                  </p>
                  {l.endNotes && <p className="text-xs text-gray-400 mt-1">{l.endNotes}</p>}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {matrix && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">繳付租金通知單 Rent Payment Notice</h2>
            <p className="text-sm text-gray-500">{matrix.fromPeriod} → {matrix.targetPeriod}{matrix.paidLookbackMonths ? ` · ${matrix.paidLookbackMonths} paid mo. lookback` : ''}</p>
          </div>
          <div className="p-4">
            <RentPaymentNoticeMatrix matrix={matrix} />
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="font-semibold">Outstanding Billing Items 未付明細</h2>
          <p className="text-xs text-gray-500 mt-0.5">Per unit · month · charge type (rent / water / electricity)</p>
        </div>
        {outstandingCharges.length === 0 ? (
          <p className="p-8 text-center text-gray-400 text-sm">All billing items paid</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left">Unit / Period</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-right">Due</th>
                <th className="px-4 py-3 text-right">Paid</th>
                <th className="px-4 py-3 text-right">Outstanding</th>
                <th className="px-4 py-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {outstandingCharges.map((c) => {
                const unit = units.find((u) => u.id === c.unitId);
                const out = chargeOutstanding(c);
                return (
                  <tr key={c.id}>
                    <td className="px-4 py-3 font-medium">{unit?.unitName} · {c.billingPeriod}</td>
                    <td className="px-4 py-3 text-gray-600">{CHARGE_TYPE_LABELS[c.chargeType]}</td>
                    <td className="px-4 py-3 text-right">{formatMoney(c.amountDue)}</td>
                    <td className="px-4 py-3 text-right text-green-700">{formatMoney(c.amountAllocated)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-red-700">{formatMoney(out)}</td>
                    <td className="px-4 py-3 text-xs font-semibold">{CHARGE_STATUS_LABELS[c.status]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Billing History 帳單紀錄</h2>
          <p className="text-xs text-gray-500 mt-0.5">Monthly rent / water / electricity billed during this tenant&apos;s leases</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left">Unit 單位</th>
                <th className="px-4 py-3 text-left">Period 帳期</th>
                <th className="px-4 py-3 text-right">Rent 租金</th>
                <th className="px-4 py-3 text-right">Water 水費</th>
                <th className="px-4 py-3 text-right">Elec 電費</th>
                <th className="px-4 py-3 text-right">Total 總額</th>
                <th className="px-4 py-3 text-left">Paid Date 交租日</th>
                <th className="px-4 py-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(billingHistory || []).map((r) => (
                <tr key={`${r.unitId}-${r.billingPeriod}`} className="hover:bg-gray-50/80">
                  <td className="px-4 py-3 font-medium">{r.unitName}</td>
                  <td className="px-4 py-3">{r.billingPeriod}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{formatMoney(r.baseRent)}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{formatUtilityAmount(r.waterFee)}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{formatUtilityAmount(r.electricityFee)}</td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {formatMoney(r.actualAmount)}
                    {r.amountPaid > 0 && r.amountPaid < r.actualAmount && (
                      <p className="text-[10px] text-orange-600 font-normal">Paid {formatMoney(r.amountPaid)}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{formatDisplayDate(r.paidDate) || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${RENTAL_STATUS_BADGE[r.status]}`}>
                      {RENTAL_STATUS_LABELS[r.status]}
                    </span>
                  </td>
                </tr>
              ))}
              {(!billingHistory || billingHistory.length === 0) && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">{bi('No billing history yet', '尚無帳單紀錄')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Payment Allocations 核銷對照表</h2>
          <p className="text-xs text-gray-500 mt-0.5">N-to-N: payments ↔ billing items (rent / water / electricity per unit & month)</p>
        </div>
        <div className="p-4">
          <PaymentAllocationLedger rows={allocationLedger || []} />
        </div>
      </div>

      {paymentModal && detail && (
        <div className="modal-overlay">
          <div className="modal-panel sm:max-w-3xl max-h-[92vh] overflow-y-auto">
            <h2 className="text-lg font-bold mb-1">Record Payment 記錄收款</h2>
            <p className="text-sm text-gray-500 mb-4">
              {bi('Each line is one period. Edit rent, electricity and water, then add or remove lines as needed.', '每列為一個帳期。可編輯租金、電費、水費，並增刪列數。')}
            </p>

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

              <PaymentPeriodTable
                rows={periodRows}
                onChange={applyPeriodRows}
                units={units}
                defaultUnitId={selectedUnitIds[0] || units[0]?.id}
                defaultPeriod={currentBillingPeriod()}
                extraActions={(
                  <>
                    <button type="button" className="text-xs px-2 py-1 border rounded hover:bg-gray-50" onClick={fillOutstandingPeriodRows}>
                      {bi('Fill arrears', '填未付')}
                    </button>
                    <button type="button" className="text-xs px-2 py-1 border rounded hover:bg-gray-50" onClick={() => fillAdvanceMonths(3)}>
                      {bi('3 months', '預付3個月')}
                    </button>
                    <button type="button" className="text-xs px-2 py-1 border rounded hover:bg-gray-50" onClick={() => fillAdvanceMonths(6)}>
                      {bi('6 months', '預付6個月')}
                    </button>
                    <button type="button" className="text-xs px-2 py-1 border rounded hover:bg-gray-50" onClick={() => fillAdvanceMonths(12)}>
                      {bi('12 months', '預付12個月')}
                    </button>
                  </>
                )}
              />
              <p className="text-xs text-gray-500">
                {bi('Period total', '帳期合計')}: {formatMoney(sumPaymentPeriodLines(periodRows))}
                {paymentForm.amount && ` · ${bi('Payment', '收款')} ${formatMoney(Number(paymentForm.amount) || 0)}`}
              </p>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setPaymentModal(false)} className="px-4 py-2 border rounded-lg text-sm">{BTN.cancel}</button>
              <button onClick={savePayment} disabled={busy} className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm disabled:opacity-50">
                {busy ? BTN.saving : bi('Save & Allocate', '儲存並分配')}
              </button>
            </div>
          </div>
        </div>
      )}

      {allocateModal && (
        <div className="modal-overlay">
          <div className="modal-panel sm:max-w-lg max-h-[85vh] overflow-y-auto">
            <h2 className="text-lg font-bold mb-1">Allocate Payment 分配收款</h2>
            <p className="text-sm text-gray-500 mb-4">
              Unallocated: {formatMoney(allocateModal.amountUnallocated)}
            </p>
            <div className="space-y-2">
              {outstandingCharges.map((c) => {
                const unit = units.find((u) => u.id === c.unitId);
                const outstanding = chargeOutstanding(c);
                return (
                  <div key={c.id} className="flex items-center gap-3 text-sm border-b border-gray-100 pb-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{unit?.unitName} · {c.billingPeriod}</p>
                      <p className="text-xs text-gray-500">{CHARGE_TYPE_LABELS[c.chargeType]} · Due {formatMoney(outstanding)}</p>
                    </div>
                    <input
                      type="number"
                      className="w-24 px-2 py-1 border rounded text-right"
                      placeholder="0"
                      max={outstanding}
                      value={allocations[c.id] || ''}
                      onChange={(e) => setAllocations({ ...allocations, [c.id]: e.target.value })}
                      aria-label={bi(`Allocate ${CHARGE_TYPE_LABELS[c.chargeType]}`, `分配${CHARGE_TYPE_LABELS[c.chargeType]}`)}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setAllocateModal(null)} className="px-4 py-2 border rounded-lg text-sm">{BTN.cancel}</button>
              <button onClick={saveAllocation} disabled={busy} className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm disabled:opacity-50">
                {busy ? BTN.saving : bi('Allocate', '分配')}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
