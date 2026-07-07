'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import LeaseStatusBadge from '@/components/LeaseStatusBadge';
import RentPaymentNoticeMatrix from '@/components/RentPaymentNoticeMatrix';
import ChargeAllocationGrid, {
  chargeRowsByType,
  distributeByChargeType,
  fillOutstandingValues,
  fillRentOnlyValues,
  sumAllocationValues,
} from '@/components/ChargeAllocationGrid';
import PaymentHistoryTable from '@/components/PaymentHistoryTable';
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
  type RentalChargeItem,
  type RentalPayment,
  type RentalPaymentAllocationDetail,
  type RentalPaymentWithAllocations,
  type RentalTenant,
  type RentPaymentNoticeMatrix as MatrixType,
  type TenantBillingHistoryRow,
  type TenantLeaseHistoryRow,
  type TenantProfileSummary,
} from '@/lib/rentals';
import { isSectionReadOnly } from '@/lib/permissions';

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
  const { user } = useAuth();
  const readOnly = user ? isSectionReadOnly(user.role, 'rentals') : false;
  const [period, setPeriod] = useState(currentBillingPeriod());
  const [fromPeriod, setFromPeriod] = useState(''); // optional override; auto-detect arrears when empty
  const [paidLookback, setPaidLookback] = useState(2);
  const [detail, setDetail] = useState<TenantDetail | null>(null);
  const [matrix, setMatrix] = useState<MatrixType | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [paymentModal, setPaymentModal] = useState(false);
  const [allocateModal, setAllocateModal] = useState<RentalPayment | null>(null);
  const [paymentForm, setPaymentForm] = useState({ paymentDate: todayFormDate(), amount: '', method: '', reference: '', notes: '' });
  const [chargeAllocValues, setChargeAllocValues] = useState<Record<string, string>>({});
  const [allocations, setAllocations] = useState<Record<number, string>>({});
  const [selectedUnitIds, setSelectedUnitIds] = useState<number[]>([]);
  const [contactForm, setContactForm] = useState({ name: '', phone: '', email: '', notes: '' });
  const [contactSaving, setContactSaving] = useState(false);
  const [contactEditing, setContactEditing] = useState(false);
  const [paymentMode, setPaymentMode] = useState<'byPeriod' | 'byType'>('byPeriod');
  const [payMonths, setPayMonths] = useState('1');
  const [periodRows, setPeriodRows] = useState<{ unitId: number; billingPeriod: string; amount: string }[]>([]);

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
            phone: d.tenant.phone || '',
            email: d.tenant.email || '',
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

  const openPaymentModal = () => {
    if (!detail) return;
    const rows = chargeRowsByType(detail.outstandingCharges);
    const filled = fillOutstandingValues(rows);
    setChargeAllocValues(filled);
    setPaymentMode('byPeriod');
    setPeriodRows([]);
    setPayMonths('1');
    setPaymentForm((f) => ({
      ...f,
      amount: String(sumAllocationValues(filled) || ''),
    }));
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
    if (!detail) return;
    const seen = new Set<string>();
    const rows: { unitId: number; billingPeriod: string; amount: string }[] = [];
    const charges = [...detail.outstandingCharges]
      .filter((c) => chargeOutstanding(c) > 0)
      .sort((a, b) => a.billingPeriod.localeCompare(b.billingPeriod) || a.unitId - b.unitId);
    for (const c of charges) {
      const key = `${c.unitId}:${c.billingPeriod}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const periodTotal = charges
        .filter((x) => x.unitId === c.unitId && x.billingPeriod === c.billingPeriod)
        .reduce((s, x) => s + chargeOutstanding(x), 0);
      rows.push({ unitId: c.unitId, billingPeriod: c.billingPeriod, amount: String(periodTotal) });
    }
    setPeriodRows(rows);
    setPaymentForm((f) => ({ ...f, amount: String(rows.reduce((s, r) => s + Number(r.amount || 0), 0)) }));
  };

  const fillAdvanceMonths = (months: number) => {
    if (!detail) return;
    const targetUnits = detail.units.filter((u) => selectedUnitIds.includes(u.id));
    const unitsToFill = targetUnits.length ? targetUnits : detail.units;
    const rows: { unitId: number; billingPeriod: string; amount: string }[] = [];
    for (const u of unitsToFill) {
      let p = startPeriodForUnit(u.id);
      const rent = monthlyRentForUnit(u.id);
      for (let i = 0; i < months; i += 1) {
        rows.push({ unitId: u.id, billingPeriod: p, amount: rent ? String(rent) : '' });
        p = addBillingMonths(p, 1);
      }
    }
    setPeriodRows(rows);
    setPayMonths(String(months));
    setPaymentForm((f) => ({ ...f, amount: String(rows.reduce((s, r) => s + Number(r.amount || 0), 0)) }));
  };

  const addPeriodRow = () => {
    const unitId = selectedUnitIds[0] || detail?.units[0]?.id;
    if (!unitId) return;
    setPeriodRows((prev) => [...prev, { unitId, billingPeriod: startPeriodForUnit(unitId), amount: '' }]);
  };

  const chargeTypeRows = detail ? chargeRowsByType(detail.outstandingCharges) : [];

  const savePayment = async () => {
    if (!detail) return;
    const amount = Number(paymentForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setToast('Enter a valid payment amount');
      return;
    }

    let body: Record<string, unknown> = {
      tenantId: detail.tenant.id,
      paymentDate: paymentForm.paymentDate,
      amount,
      method: paymentForm.method || null,
      reference: paymentForm.reference || null,
      notes: paymentForm.notes || null,
      unitIds: selectedUnitIds.length ? selectedUnitIds : undefined,
    };

    if (paymentMode === 'byPeriod') {
      const periodAllocations = periodRows
        .filter((r) => r.billingPeriod && Number(r.amount) > 0)
        .map((r) => ({ unitId: r.unitId, billingPeriod: r.billingPeriod, amount: Number(r.amount) }));
      if (periodAllocations.length) {
        body.periodAllocations = periodAllocations;
      } else {
        body.autoAllocate = true;
      }
    } else {
      const allocSum = sumAllocationValues(chargeAllocValues);
      if (allocSum > amount + 0.01) {
        setToast('Allocated total exceeds payment amount');
        return;
      }
      const allocations = distributeByChargeType(detail.outstandingCharges, chargeAllocValues);
      if (allocations.length && Math.abs(allocSum - amount) < 0.02) {
        body.allocations = allocations;
      } else if (allocations.length && allocSum < amount) {
        body.periodAllocations = undefined;
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
    if (!res.ok) {
      const d = await res.json();
      setToast(d.error || 'Failed to record payment');
      return;
    }
    setPaymentModal(false);
    setChargeAllocValues({});
    setPeriodRows([]);
    setPaymentForm({ paymentDate: todayFormDate(), amount: '', method: '', reference: '', notes: '' });
    setToast('Payment recorded — outstanding balance updated');
    load();
  };

  const inp = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm';

  if (loading && !detail) {
    return <AppLayout><div className="p-12 text-center text-gray-400">Loading…</div></AppLayout>;
  }
  if (loadError || !detail) {
    return (
      <AppLayout>
        <div className="p-12 text-center">
          <p className="text-gray-500">{loadError || 'Tenant not found'}</p>
          <Link href="/rentals" className="text-brand-600 text-sm font-medium mt-3 inline-block">← Back to Rentals</Link>
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
      setToast(d.error || 'Allocation failed');
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
        <div className="page-actions flex-wrap">
          <input type="month" value={fromPeriod} onChange={(e) => setFromPeriod(e.target.value)} className={`${inp} w-auto`} title="From period (optional — auto-detects arrears)" placeholder="From (auto)" />
          <span className="text-gray-400 self-center">→</span>
          <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className={`${inp} w-auto`} title="Target period" />
          <input type="number" min={0} max={12} value={paidLookback} onChange={(e) => setPaidLookback(Number(e.target.value) || 0)} className={`${inp} w-16`} title="Paid lookback months" />
          <span className="text-xs text-gray-400 self-center">paid mo.</span>
          <Link
            href={debitNoteHref()}
            className={`btn border border-gray-300 text-gray-700 hover:bg-gray-50 ${!selectedUnitIds.length ? 'opacity-40 pointer-events-none' : ''}`}
          >
            繳費通知單 Debit Note
          </Link>
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
              Edit 編輯
            </button>
          )}
        </div>
        <div className="p-6">
          {contactEditing ? (
            <div className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Name 姓名</label>
                  <input className={inp} value={contactForm.name} onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })} />
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
                      phone: tenant.phone || '',
                      email: tenant.email || '',
                      notes: tenant.notes || '',
                    });
                  }}
                  className="px-4 py-2 border rounded-lg text-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveContact}
                  disabled={contactSaving}
                  className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm disabled:opacity-50"
                >
                  {contactSaving ? 'Saving…' : 'Save 儲存'}
                </button>
              </div>
            </div>
          ) : (
            <dl className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
              <div>
                <dt className="text-xs text-gray-500 uppercase">Phone 電話</dt>
                <dd className="mt-1 font-medium text-gray-900">{tenant.phone || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500 uppercase">Email 電郵</dt>
                <dd className="mt-1 font-medium text-gray-900 break-all">{tenant.email || '—'}</dd>
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
              <p className="text-sm text-gray-400 text-center py-4">No contract history yet</p>
            ) : (
              leaseHistory.map((l) => (
                <div key={l.id} className={`rounded-xl border p-3 text-sm ${l.isCurrent ? 'border-brand-200 bg-brand-50/40' : 'border-gray-100'}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`/rentals/${l.unitId}`} className="font-semibold text-brand-700 hover:underline">{l.unitName}</Link>
                    <LeaseStatusBadge status={computeLeaseDisplayStatus(l)} />
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
          <h2 className="font-semibold">Payment History 以往租金紀錄</h2>
          <p className="text-xs text-gray-500 mt-0.5">All units under this tenant · includes paid date 交租日</p>
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
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No billing history yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="font-semibold">Payments 收款紀錄</h2>
          <p className="text-xs text-gray-500 mt-0.5">Expand rows for itemized unit / period / charge-type breakdown</p>
        </div>
        <PaymentHistoryTable
          payments={paymentsWithAllocations || []}
          readOnly={readOnly}
          onAllocate={(paymentId) => {
            const p = payments.find((x) => x.id === paymentId);
            if (p) openAllocate(p);
          }}
        />
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="font-semibold">Payment Allocations 核銷對照表</h2>
          <p className="text-xs text-gray-500 mt-0.5">N-to-N: payments ↔ billing items (rent / water / electricity per unit & month)</p>
        </div>
        <div className="p-4">
          <PaymentAllocationLedger rows={allocationLedger || []} />
        </div>
      </div>

      {paymentModal && detail && (
        <div className="modal-overlay">
          <div className="modal-panel sm:max-w-2xl max-h-[92vh] overflow-y-auto">
            <h2 className="text-lg font-bold mb-1">Record Payment 記錄收款</h2>
            <p className="text-sm text-gray-500 mb-4">Enter paid date, amount and period breakdown — advance rent (半年／一年) auto-deducts outstanding</p>

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
                  <input className={inp} value={paymentForm.method} onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Reference 參考</label>
                  <input className={inp} value={paymentForm.reference} onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })} />
                </div>
              </div>

              {paymentMode === 'byPeriod' ? (
                <div>
                  <div className="mb-4 p-4 rounded-xl border border-brand-100 bg-brand-50/40">
                    <label className="text-xs font-semibold text-gray-700 uppercase">繳付月數 Months to pay</label>
                    <p className="text-xs text-gray-500 mt-0.5 mb-2">Enter how many months the tenant is paying (1, 2, 3…)</p>
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        min={1}
                        max={36}
                        className={`${inp} w-24 text-center font-semibold`}
                        value={payMonths}
                        onChange={(e) => {
                          const n = Math.max(1, Math.min(36, Number(e.target.value) || 1));
                          setPayMonths(String(n));
                          fillAdvanceMonths(n);
                        }}
                      />
                      <span className="text-sm text-gray-600">個月 month(s)</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <label className="text-xs font-semibold text-gray-600 uppercase">Period breakdown 帳期明細</label>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="text-xs px-2 py-1 border rounded hover:bg-gray-50" onClick={fillOutstandingPeriodRows}>
                        填未付 Fill arrears
                      </button>
                      <button type="button" className="text-xs px-2 py-1 border rounded hover:bg-gray-50" onClick={() => fillAdvanceMonths(6)}>
                        預付6個月
                      </button>
                      <button type="button" className="text-xs px-2 py-1 border rounded hover:bg-gray-50" onClick={() => { setPayMonths('12'); fillAdvanceMonths(12); }}>
                        預付12個月
                      </button>
                      <button type="button" className="text-xs px-2 py-1 border rounded hover:bg-gray-50" onClick={addPeriodRow}>
                        + Row
                      </button>
                    </div>
                  </div>
                  {periodRows.length === 0 ? (
                    <p className="text-sm text-gray-400 border border-dashed rounded-lg p-4 text-center">
                      Add period rows, or enter total only — system will auto-allocate FIFO (including future months for advance rent)
                    </p>
                  ) : (
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-xs text-gray-500">
                          <tr>
                            <th className="px-3 py-2 text-left">Unit</th>
                            <th className="px-3 py-2 text-left">Period 帳期</th>
                            <th className="px-3 py-2 text-right">Amount 金額</th>
                            <th className="w-8" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {periodRows.map((row, idx) => (
                            <tr key={idx}>
                              <td className="px-3 py-2">
                                {units.length > 1 ? (
                                  <select
                                    className="w-full text-xs border rounded px-1 py-1"
                                    value={row.unitId}
                                    onChange={(e) => {
                                      const unitId = Number(e.target.value);
                                      setPeriodRows((prev) => prev.map((r, i) => i === idx ? { ...r, unitId } : r));
                                    }}
                                  >
                                    {units.map((u) => (
                                      <option key={u.id} value={u.id}>{u.unitName}</option>
                                    ))}
                                  </select>
                                ) : (
                                  <span className="text-xs">{units[0]?.unitName}</span>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="month"
                                  className="w-full text-xs border rounded px-2 py-1"
                                  value={row.billingPeriod}
                                  onChange={(e) => {
                                    const billingPeriod = e.target.value;
                                    setPeriodRows((prev) => prev.map((r, i) => i === idx ? { ...r, billingPeriod } : r));
                                  }}
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="number"
                                  className="w-full text-xs border rounded px-2 py-1 text-right"
                                  value={row.amount}
                                  onChange={(e) => {
                                    const amount = e.target.value;
                                    setPeriodRows((prev) => {
                                      const next = prev.map((r, i) => i === idx ? { ...r, amount } : r);
                                      setPaymentForm((f) => ({ ...f, amount: String(next.reduce((s, r) => s + Number(r.amount || 0), 0)) }));
                                      return next;
                                    });
                                  }}
                                />
                              </td>
                              <td className="px-1 py-2">
                                <button
                                  type="button"
                                  className="text-gray-400 hover:text-red-600 text-xs"
                                  onClick={() => setPeriodRows((prev) => prev.filter((_, i) => i !== idx))}
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
                    Period total: {formatMoney(periodRows.reduce((s, r) => s + Number(r.amount || 0), 0))}
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
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setPaymentModal(false)} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
              <button onClick={savePayment} disabled={busy} className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm disabled:opacity-50">
                {busy ? 'Saving…' : 'Save & Allocate'}
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
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setAllocateModal(null)} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
              <button onClick={saveAllocation} disabled={busy} className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm disabled:opacity-50">
                {busy ? 'Saving…' : 'Allocate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
