'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import RentPaymentNoticeMatrix from '@/components/RentPaymentNoticeMatrix';
import ChargeAllocationGrid, {
  chargeRowsFromItems,
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
  chargeOutstanding,
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
} from '@/lib/rentals';
import { isSectionReadOnly } from '@/lib/permissions';

interface TenantDetail {
  tenant: RentalTenant;
  units: { id: number; unitName: string; tenantName: string }[];
  outstandingCharges: RentalChargeItem[];
  payments: RentalPayment[];
  paymentsWithAllocations: RentalPaymentWithAllocations[];
  allocationLedger: RentalPaymentAllocationDetail[];
  billingHistory: TenantBillingHistoryRow[];
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

  const openPaymentModal = () => {
    if (!detail) return;
    const unitNames = Object.fromEntries(detail.units.map((u) => [u.id, u.unitName]));
    const rows = chargeRowsFromItems(detail.outstandingCharges, unitNames);
    const filled = fillOutstandingValues(rows);
    setChargeAllocValues(filled);
    setPaymentForm((f) => ({
      ...f,
      amount: String(sumAllocationValues(filled) || ''),
    }));
    setPaymentModal(true);
  };

  const savePayment = async () => {
    if (!detail) return;
    const allocSum = sumAllocationValues(chargeAllocValues);
    const amount = Number(paymentForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setToast('Enter a valid payment amount');
      return;
    }
    if (allocSum > amount + 0.01) {
      setToast('Allocated total exceeds payment amount');
      return;
    }
    const allocations = Object.entries(chargeAllocValues)
      .filter(([, v]) => v && Number(v) > 0)
      .map(([chargeItemId, v]) => ({ chargeItemId: Number(chargeItemId), amount: Number(v) }));

    setBusy(true);
    const res = await fetch('/api/rentals/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantId: detail.tenant.id,
        paymentDate: paymentForm.paymentDate,
        amount,
        method: paymentForm.method || null,
        reference: paymentForm.reference || null,
        notes: paymentForm.notes || null,
        allocations: allocations.length ? allocations : undefined,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json();
      setToast(d.error || 'Failed to record payment');
      return;
    }
    setPaymentModal(false);
    setChargeAllocValues({});
    setPaymentForm({ paymentDate: todayFormDate(), amount: '', method: '', reference: '', notes: '' });
    setToast(allocations.length ? 'Payment recorded and allocated' : 'Payment recorded — allocate remaining balance when ready');
    load();
  };

  const openAllocate = (payment: RentalPayment) => {
    const p = payments.find((x) => x.id === payment.id) || payment;
    setAllocateModal(p);
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

  const { tenant, units, outstandingCharges, payments, paymentsWithAllocations, allocationLedger, billingHistory } = detail;

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
          <h1 className="page-title mt-1">{tenant.name}</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {tenant.phone && <span>{tenant.phone} · </span>}
            {tenant.email || 'No email'}
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

      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase">Units 單位</p>
          <p className="text-2xl font-bold mt-1">{units.length}</p>
          <p className="text-xs text-gray-500 mt-2 mb-1">Select units for grouped debit note 合併繳費通知單</p>
          <ul className="mt-1 text-sm text-gray-600 space-y-1.5">
            {units.map((u) => (
              <li key={u.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedUnitIds.includes(u.id)}
                  onChange={() => toggleUnit(u.id)}
                  className="h-4 w-4 rounded border-gray-300"
                />
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
            <p className="text-sm text-gray-500 mb-4">Split payment across rent / water / electricity per unit and month</p>
            <div className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500">Paid Date 交租日</label>
                  <input className={inp} value={paymentForm.paymentDate} onChange={(e) => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })} placeholder="DD/MM/YYYY" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Total Amount 收款總額</label>
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

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-gray-600 uppercase">Allocate to billing items 分配至收費細項</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="text-xs px-2 py-1 border rounded hover:bg-gray-50"
                      onClick={() => {
                        const rows = chargeRowsFromItems(detail.outstandingCharges, Object.fromEntries(detail.units.map((u) => [u.id, u.unitName])));
                        const filled = fillRentOnlyValues(rows);
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
                        const rows = chargeRowsFromItems(detail.outstandingCharges, Object.fromEntries(detail.units.map((u) => [u.id, u.unitName])));
                        const filled = fillOutstandingValues(rows);
                        setChargeAllocValues(filled);
                        setPaymentForm((f) => ({ ...f, amount: String(sumAllocationValues(filled) || f.amount) }));
                      }}
                    >
                      Fill all 填滿未付
                    </button>
                  </div>
                </div>
                <ChargeAllocationGrid
                  rows={chargeRowsFromItems(detail.outstandingCharges, Object.fromEntries(detail.units.map((u) => [u.id, u.unitName])))}
                  values={chargeAllocValues}
                  onChange={setChargeAllocValues}
                />
                <p className="text-xs text-gray-500 mt-2">
                  Allocated: {formatMoney(sumAllocationValues(chargeAllocValues))}
                  {paymentForm.amount && ` / Payment ${formatMoney(Number(paymentForm.amount) || 0)}`}
                </p>
              </div>
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
