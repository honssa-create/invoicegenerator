'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import RentPaymentNoticeMatrix from '@/components/RentPaymentNoticeMatrix';
import { useAuth } from '@/components/AuthProvider';
import {
  CHARGE_TYPE_LABELS,
  chargeOutstanding,
  currentBillingPeriod,
  formatDisplayDate,
  formatMoney,
  todayFormDate,
  type RentalChargeItem,
  type RentalPayment,
  type RentalTenant,
  type RentPaymentNoticeMatrix as MatrixType,
} from '@/lib/rentals';
import { isSectionReadOnly } from '@/lib/permissions';

interface TenantDetail {
  tenant: RentalTenant;
  units: { id: number; unitName: string; tenantName: string }[];
  outstandingCharges: RentalChargeItem[];
  payments: RentalPayment[];
}

export default function TenantDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const readOnly = user ? isSectionReadOnly(user.role, 'rentals') : false;
  const [period, setPeriod] = useState(currentBillingPeriod());
  const [fromPeriod, setFromPeriod] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 5);
    return d.toISOString().slice(0, 7);
  });
  const [detail, setDetail] = useState<TenantDetail | null>(null);
  const [matrix, setMatrix] = useState<MatrixType | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [paymentModal, setPaymentModal] = useState(false);
  const [allocateModal, setAllocateModal] = useState<RentalPayment | null>(null);
  const [paymentForm, setPaymentForm] = useState({ paymentDate: todayFormDate(), amount: '', method: '', reference: '', notes: '' });
  const [allocations, setAllocations] = useState<Record<number, string>>({});

  const load = () => {
    setLoading(true);
    Promise.all([
      fetch(`/api/rentals/tenants/${id}`).then((r) => r.json()),
      fetch(`/api/rentals/tenants/${id}/rent-payment-notice?period=${period}&from=${fromPeriod}`).then((r) => r.json()),
    ])
      .then(([d, m]) => {
        if (d.tenant) setDetail(d);
        if (m.tenant) setMatrix(m);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id, period, fromPeriod]);

  const savePayment = async () => {
    if (!detail) return;
    setBusy(true);
    const res = await fetch('/api/rentals/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantId: detail.tenant.id,
        paymentDate: paymentForm.paymentDate,
        amount: Number(paymentForm.amount),
        method: paymentForm.method || null,
        reference: paymentForm.reference || null,
        notes: paymentForm.notes || null,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json();
      setToast(d.error || 'Failed to record payment');
      return;
    }
    setPaymentModal(false);
    setPaymentForm({ paymentDate: todayFormDate(), amount: '', method: '', reference: '', notes: '' });
    setToast('Payment recorded');
    load();
  };

  const openAllocate = (payment: RentalPayment) => {
    setAllocateModal(payment);
    const init: Record<number, string> = {};
    for (const c of detail?.outstandingCharges || []) {
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

  const inp = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm';

  if (loading && !detail) {
    return <AppLayout><div className="p-12 text-center text-gray-400">Loading…</div></AppLayout>;
  }
  if (!detail) {
    return <AppLayout><div className="p-12 text-center text-gray-400">Tenant not found</div></AppLayout>;
  }

  const { tenant, units, outstandingCharges, payments } = detail;

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <Link href="/rentals" className="text-sm text-brand-600 hover:text-brand-700">← Rentals</Link>
          <h1 className="page-title mt-1">{tenant.name}</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {tenant.phone && <span>{tenant.phone} · </span>}
            {tenant.email || 'No email'}
            {readOnly && <span className="ml-2 text-amber-600">(Read-only)</span>}
          </p>
        </div>
        <div className="page-actions flex-wrap">
          <input type="month" value={fromPeriod} onChange={(e) => setFromPeriod(e.target.value)} className={`${inp} w-auto`} title="From period" />
          <span className="text-gray-400 self-center">→</span>
          <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className={`${inp} w-auto`} title="To period" />
          <Link
            href={`/rentals/tenants/${id}/rent-payment-notice?period=${period}&from=${fromPeriod}`}
            className="btn border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            繳付租金通知單 Print
          </Link>
          {!readOnly && (
            <button onClick={() => setPaymentModal(true)} className="btn bg-brand-600 text-white hover:bg-brand-700">
              + Record Payment
            </button>
          )}
        </div>
      </div>

      {toast && (
        <div onClick={() => setToast('')} className="mb-4 p-3 rounded-lg bg-brand-50 text-brand-700 text-sm cursor-pointer">{toast} ✕</div>
      )}

      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase">Units 單位</p>
          <p className="text-2xl font-bold mt-1">{units.length}</p>
          <ul className="mt-2 text-sm text-gray-600 space-y-1">
            {units.map((u) => (
              <li key={u.id}>
                <Link href={`/rentals/${u.id}`} className="text-brand-600 hover:underline">{u.unitName}</Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase">Outstanding 未付</p>
          <p className="text-2xl font-bold mt-1 text-red-700">{matrix ? formatMoney(matrix.grandTotal) : '—'}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase">Payments 收款</p>
          <p className="text-2xl font-bold mt-1">{payments.length}</p>
        </div>
      </div>

      {matrix && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">繳付租金通知單 Rent Payment Notice</h2>
            <p className="text-sm text-gray-500">{fromPeriod} → {period}</p>
          </div>
          <div className="p-4">
            <RentPaymentNoticeMatrix matrix={matrix} />
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="font-semibold">Payments 收款紀錄</h2>
        </div>
        {payments.length === 0 ? (
          <p className="p-8 text-center text-gray-400 text-sm">No tenant-level payments yet</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-right">Allocated</th>
                <th className="px-4 py-3 text-right">Unallocated</th>
                <th className="px-4 py-3 text-left">Reference</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {payments.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3">{formatDisplayDate(p.paymentDate)}</td>
                  <td className="px-4 py-3 text-right font-semibold">{formatMoney(p.amount)}</td>
                  <td className="px-4 py-3 text-right text-green-700">{formatMoney(p.amountAllocated)}</td>
                  <td className="px-4 py-3 text-right text-orange-600">{formatMoney(p.amountUnallocated)}</td>
                  <td className="px-4 py-3 text-gray-500">{p.reference || p.method || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    {!readOnly && p.amountUnallocated > 0 && (
                      <button onClick={() => openAllocate(p)} className="text-brand-600 text-xs font-medium hover:underline">
                        Allocate 分配
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {paymentModal && (
        <div className="modal-overlay">
          <div className="modal-panel sm:max-w-md">
            <h2 className="text-lg font-bold mb-4">Record Payment 記錄收款</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500">Date 日期</label>
                <input className={inp} value={paymentForm.paymentDate} onChange={(e) => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })} placeholder="DD/MM/YYYY" />
              </div>
              <div>
                <label className="text-xs text-gray-500">Amount 金額</label>
                <input type="number" className={inp} value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} />
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
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setPaymentModal(false)} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
              <button onClick={savePayment} disabled={busy} className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm disabled:opacity-50">
                {busy ? 'Saving…' : 'Save'}
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
