'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import {
  RENTAL_STATUS_COLORS,
  RENTAL_STATUS_LABELS,
  currentBillingPeriod,
  daysRemaining,
  formatMoney,
  type RentRecord,
  type RentalUnit,
  type RentalUnitWithRecord,
  type PreviousYearRent,
} from '@/lib/rentals';

interface DashboardData {
  units: RentalUnitWithRecord[];
  metrics: { totalRevenue: number; outstanding: number; paidCount: number; totalUnits: number };
  period: string;
}

const blankUnit: Partial<RentalUnit> = {
  unitName: '',
  tenantName: '',
  tenantEmail: '',
  currentYearRent: 0,
  previousYearsRent: [],
  leaseStartDate: '',
  leaseEndDate: '',
  dueDateDay: 1,
  autoSendReceiptEmail: false,
  automationEnabled: true,
};

export default function RentalsPage() {
  const [period, setPeriod] = useState(currentBillingPeriod());
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [unitModal, setUnitModal] = useState<Partial<RentalUnit> | null>(null);
  const [previousYearsText, setPreviousYearsText] = useState('');
  const [invoiceModal, setInvoiceModal] = useState<RentalUnitWithRecord | null>(null);
  const [paidModal, setPaidModal] = useState<RentalUnitWithRecord | null>(null);
  const [historyUnit, setHistoryUnit] = useState<RentalUnitWithRecord | null>(null);
  const [amountOverride, setAmountOverride] = useState('');
  const [emailNote, setEmailNote] = useState('');
  const [receiptNote, setReceiptNote] = useState('');
  const [autoReceipt, setAutoReceipt] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');

  const load = () => {
    setLoading(true);
    fetch(`/api/rentals?period=${period}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [period]);

  const units = data?.units || [];
  const metrics = data?.metrics || { totalRevenue: 0, outstanding: 0, paidCount: 0, totalUnits: 0 };

  const currentUnitForm = useMemo(() => unitModal || blankUnit, [unitModal]);

  const openUnitModal = (unit: Partial<RentalUnit>) => {
    setPreviousYearsText((unit.previousYearsRent || []).map((r) => `${r.year}, ${r.rent}`).join('\n'));
    setUnitModal(unit);
  };

  const saveUnit = async () => {
    setBusy(true);
    const isEdit = Boolean(currentUnitForm.id);
    const payload = { ...currentUnitForm, previousYearsRent: parsePreviousYears(previousYearsText) };
    const res = await fetch(isEdit ? `/api/rentals/units/${currentUnitForm.id}` : '/api/rentals', {
      method: isEdit ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    if (!res.ok) { setToast('Failed to save lease'); return; }
    setUnitModal(null);
    load();
  };

  const sendInvoice = async () => {
    if (!invoiceModal) return;
    setBusy(true);
    const res = await fetch(`/api/rentals/records/${invoiceModal.currentRecord.id}/invoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actualAmount: Number(amountOverride), note: emailNote }),
    });
    setBusy(false);
    setToast(res.ok ? 'Invoice generated / email handled' : 'Failed to send invoice');
    setInvoiceModal(null);
    load();
  };

  const markPaid = async () => {
    if (!paidModal) return;
    setBusy(true);
    const res = await fetch(`/api/rentals/records/${paidModal.currentRecord.id}/paid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ autoSendReceiptEmail: autoReceipt, note: receiptNote }),
    });
    setBusy(false);
    setToast(res.ok ? 'Marked paid / receipt handled' : 'Failed to mark paid');
    setPaidModal(null);
    load();
  };

  const runScheduler = async () => {
    setBusy(true);
    const res = await fetch(`/api/cron/rental-invoices?period=${period}`, { method: 'POST' });
    const d = await res.json();
    setBusy(false);
    setToast(res.ok ? `Processed ${d.processed} rental invoices` : d.error || 'Scheduler failed');
    load();
  };

  const input = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50/40 focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none';

  return (
    <AppLayout>
      <div className="flex items-start justify-between gap-4 mb-8 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rental Income 租金管理</h1>
          <p className="text-gray-500 mt-1">Lease dashboard + monthly rent collection grid</p>
        </div>
        <div className="flex gap-3 items-center flex-wrap">
          <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className={input} />
          <button onClick={runScheduler} disabled={busy} className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50">Run Billing</button>
          <button onClick={() => openUnitModal(blankUnit)} className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700">+ Add Unit</button>
        </div>
      </div>

      {toast && <div className="mb-4 p-3 rounded-lg bg-brand-50 text-brand-700 text-sm">{toast}</div>}

      <div className="grid md:grid-cols-3 gap-4 mb-8">
        <Metric title="Total Revenue This Month" value={formatMoney(metrics.totalRevenue)} tone="green" />
        <Metric title="Pending/Overdue Collection" value={formatMoney(metrics.outstanding)} tone="red" />
        <Metric title="Fully Paid Ratio" value={`${metrics.paidCount} / ${metrics.totalUnits} Units Paid`} tone="brand" />
      </div>

      <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-8">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-brand-600 font-semibold">Lease Overview Master Panel</p>
            <h2 className="text-lg font-bold text-gray-900">租約主控面板</h2>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left">Unit Name</th>
                <th className="px-4 py-3 text-left">租單位人士</th>
                <th className="px-4 py-3 text-right">今年租金</th>
                <th className="px-4 py-3 text-left">往年租金</th>
                <th className="px-4 py-3 text-left">起租日</th>
                <th className="px-4 py-3 text-left">到期日</th>
                <th className="px-4 py-3 text-right">Days Remaining</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {units.map((u) => {
                const remaining = daysRemaining(u.leaseEndDate);
                return (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-semibold text-gray-900">{u.unitName}</td>
                    <td className="px-4 py-3">{u.tenantName}<p className="text-xs text-gray-400">{u.tenantEmail || 'No email'}</p></td>
                    <td className="px-4 py-3 text-right font-semibold">{formatMoney(u.currentYearRent)}</td>
                    <td className="px-4 py-3">
                      {u.previousYearsRent.length ? (
                        <div className="flex flex-wrap gap-1">
                          {u.previousYearsRent.map((r) => <span key={r.year} className="px-2 py-0.5 rounded-full bg-gray-100 text-xs">{r.year}: {formatMoney(r.rent)}</span>)}
                        </div>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3">{u.leaseStartDate || '—'}</td>
                    <td className="px-4 py-3">{u.leaseEndDate || '—'}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${remaining !== null && remaining < 30 ? 'text-red-600' : 'text-gray-700'}`}>{remaining ?? '—'}</td>
                    <td className="px-4 py-3 text-right"><button onClick={() => openUnitModal(u)} className="text-brand-600 hover:text-brand-700 font-medium">Edit Lease</button></td>
                  </tr>
                );
              })}
              {!units.length && !loading && <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400">No rental units yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="mb-4">
          <p className="text-[11px] uppercase tracking-widest text-brand-600 font-semibold">Monthly Collection Grid</p>
          <h2 className="text-lg font-bold text-gray-900">每月收租看板 · {period}</h2>
        </div>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
          {units.map((u) => (
            <UnitCard
              key={u.id}
              unit={u}
              onInvoice={() => { setAmountOverride(String(u.currentRecord.actualAmount)); setEmailNote(''); setInvoiceModal(u); }}
              onPaid={() => { setAutoReceipt(u.autoSendReceiptEmail); setReceiptNote(''); setPaidModal(u); }}
              onHistory={() => setHistoryUnit(u)}
            />
          ))}
        </div>
      </section>

      {unitModal && (
        <Modal title={currentUnitForm.id ? 'Edit Lease 編輯租約' : 'New Rental Unit 新增單位'} onClose={() => setUnitModal(null)}>
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Unit Name"><input className={input} value={currentUnitForm.unitName || ''} onChange={(e) => setUnitModal({ ...currentUnitForm, unitName: e.target.value })} /></Field>
            <Field label="Tenant Name 租單位人士"><input className={input} value={currentUnitForm.tenantName || ''} onChange={(e) => setUnitModal({ ...currentUnitForm, tenantName: e.target.value })} /></Field>
            <Field label="Tenant Email"><input className={input} value={currentUnitForm.tenantEmail || ''} onChange={(e) => setUnitModal({ ...currentUnitForm, tenantEmail: e.target.value })} /></Field>
            <Field label="今年租金 Current Year Rent"><input type="number" className={input} value={currentUnitForm.currentYearRent || 0} onChange={(e) => setUnitModal({ ...currentUnitForm, currentYearRent: Number(e.target.value) })} /></Field>
            <Field label="起租日"><input type="date" className={input} value={currentUnitForm.leaseStartDate || ''} onChange={(e) => setUnitModal({ ...currentUnitForm, leaseStartDate: e.target.value })} /></Field>
            <Field label="到期日"><input type="date" className={input} value={currentUnitForm.leaseEndDate || ''} onChange={(e) => setUnitModal({ ...currentUnitForm, leaseEndDate: e.target.value })} /></Field>
            <Field label="Due Date Day"><input type="number" min={1} max={28} className={input} value={currentUnitForm.dueDateDay || 1} onChange={(e) => setUnitModal({ ...currentUnitForm, dueDateDay: Number(e.target.value) })} /></Field>
            <Field label="往年租金 (one per line: YYYY, amount)">
              <textarea
                className={input}
                rows={4}
                value={previousYearsText}
                onChange={(e) => setPreviousYearsText(e.target.value)}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(currentUnitForm.autoSendReceiptEmail)} onChange={(e) => setUnitModal({ ...currentUnitForm, autoSendReceiptEmail: e.target.checked })} /> 付款後自動發送收據 Email</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={currentUnitForm.automationEnabled !== false} onChange={(e) => setUnitModal({ ...currentUnitForm, automationEnabled: e.target.checked })} /> Monthly invoice automation</label>
          </div>
          <div className="flex justify-end gap-3 mt-6"><button onClick={() => setUnitModal(null)} className="px-4 py-2 border rounded-lg">Cancel</button><button onClick={saveUnit} disabled={busy} className="px-4 py-2 bg-brand-600 text-white rounded-lg disabled:opacity-50">Save Lease</button></div>
        </Modal>
      )}

      {invoiceModal && (
        <Modal title={`Send Invoice · ${invoiceModal.unitName}`} onClose={() => setInvoiceModal(null)}>
          <Field label="Rent Amount Override"><input type="number" className={input} value={amountOverride} onChange={(e) => setAmountOverride(e.target.value)} /></Field>
          <Field label="Email Preview / Custom Note"><textarea className={input} rows={4} value={emailNote} onChange={(e) => setEmailNote(e.target.value)} placeholder={`Dear ${invoiceModal.tenantName}, ...`} /></Field>
          <p className="text-sm text-gray-500 mt-3">Email to: {invoiceModal.tenantEmail || 'No tenant email — log only'}</p>
          <div className="flex justify-between gap-3 mt-6">
            <Link href={`/rentals/records/${invoiceModal.currentRecord.id}/invoice`} className="px-4 py-2 border rounded-lg">Preview Print View</Link>
            <button onClick={sendInvoice} disabled={busy} className="px-4 py-2 bg-brand-600 text-white rounded-lg disabled:opacity-50">Send Invoice Now</button>
          </div>
        </Modal>
      )}

      {paidModal && (
        <Modal title={`Mark as Paid · ${paidModal.unitName}`} onClose={() => setPaidModal(null)}>
          <div className="rounded-xl bg-green-50 border border-green-200 p-4 mb-4">
            <p className="text-sm text-green-700">Amount</p>
            <p className="text-3xl font-bold text-green-800">{formatMoney(paidModal.currentRecord.actualAmount)}</p>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium mb-4">
            <input type="checkbox" checked={autoReceipt} onChange={(e) => setAutoReceipt(e.target.checked)} />
            付款後自動發送收據 Email (Auto-send receipt email upon payment confirmation)
          </label>
          <Field label="Receipt Email Preview / Optional Note"><textarea className={input} rows={4} value={receiptNote} onChange={(e) => setReceiptNote(e.target.value)} /></Field>
          <div className="flex justify-end gap-3 mt-6"><button onClick={() => setPaidModal(null)} className="px-4 py-2 border rounded-lg">Cancel</button><button onClick={markPaid} disabled={busy} className="px-4 py-2 bg-green-600 text-white rounded-lg disabled:opacity-50">Confirm Paid</button></div>
        </Modal>
      )}

      {historyUnit && (
        <Modal title={`History · ${historyUnit.unitName}`} onClose={() => setHistoryUnit(null)}>
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-gray-500 border-b"><tr><th className="py-2 text-left">Period</th><th className="py-2 text-right">Amount</th><th className="py-2 text-left">Status</th><th className="py-2 text-right">Docs</th></tr></thead>
            <tbody className="divide-y">
              {historyUnit.history.map((r) => (
                <tr key={r.id}>
                  <td className="py-2">{r.billingPeriod}</td>
                  <td className="py-2 text-right">{formatMoney(r.actualAmount)}</td>
                  <td className="py-2">{RENTAL_STATUS_LABELS[r.status]}</td>
                  <td className="py-2 text-right space-x-2">
                    <Link href={`/rentals/records/${r.id}/invoice`} className="text-brand-600">Invoice</Link>
                    <Link href={`/rentals/records/${r.id}/receipt`} className="text-brand-600">Receipt</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Modal>
      )}
    </AppLayout>
  );
}

function Metric({ title, value, tone }: { title: string; value: string; tone: 'green' | 'red' | 'brand' }) {
  const cls = tone === 'green' ? 'text-green-700 bg-green-50' : tone === 'red' ? 'text-red-700 bg-red-50' : 'text-brand-700 bg-brand-50';
  return <div className="bg-white border border-gray-200 rounded-2xl p-5"><p className="text-sm text-gray-500">{title}</p><p className={`mt-2 text-2xl font-bold rounded-lg inline-block px-2 py-1 ${cls}`}>{value}</p></div>;
}

function UnitCard({ unit, onInvoice, onPaid, onHistory }: { unit: RentalUnitWithRecord; onInvoice: () => void; onPaid: () => void; onHistory: () => void }) {
  const record = unit.currentRecord;
  return (
    <div className={`bg-white rounded-2xl border-2 p-5 ${RENTAL_STATUS_COLORS[record.status]}`}>
      <div className="flex items-start justify-between gap-3">
        <div><h3 className="text-lg font-bold text-gray-900">{unit.unitName}</h3><p className="text-sm text-gray-600">{unit.tenantName}</p></div>
        <span className="text-xs font-semibold px-2 py-1 rounded-full bg-white/70">{RENTAL_STATUS_LABELS[record.status]}</span>
      </div>
      <p className="mt-4 text-3xl font-bold text-gray-900">{formatMoney(unit.currentYearRent)}</p>
      <p className="text-sm text-gray-500">Actual this month: {formatMoney(record.actualAmount)}</p>
      <div className="mt-5 grid grid-cols-3 gap-2">
        <button onClick={onPaid} disabled={record.status === 'paid'} className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium disabled:opacity-40">Mark as Paid</button>
        <button onClick={onInvoice} className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium">Send Invoice Now</button>
        <button onClick={onHistory} className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium">View History</button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs font-medium text-gray-500 mb-1.5">{label}</label>{children}</div>;
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-5"><h2 className="text-xl font-bold">{title}</h2><button onClick={onClose} className="text-gray-400 hover:text-gray-700">✕</button></div>
        {children}
      </div>
    </div>
  );
}

function parsePreviousYears(raw: string): PreviousYearRent[] {
  return raw
    .split('\n')
    .map((line) => {
      const [year, rent] = line.split(',').map((v) => v.trim());
      return { year: Number(year), rent: Number(rent) };
    })
    .filter((r) => Number.isFinite(r.year) && Number.isFinite(r.rent) && r.year > 0);
}
