'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import { StatCard } from '@/components/ui';
import {
  EXPENSE_CATEGORIES,
  PAYMENT_STATUSES,
  CATEGORY_LABELS,
  EXPENSE_STATUS_COLORS,
  formatMoney,
} from '@/lib/expenses';
import type { Expense } from '@/lib/types';

const EMPTY_FORM = {
  category: 'ingredients',
  merchant: '',
  amount_hkd: '',
  amount_rmb: '',
  paid_date: '',
  order_no: '',
  platform: '',
  notes: '',
  payment_status: 'unpaid',
  receipt_path: '',
};

type FormState = typeof EMPTY_FORM;

export default function ExpensesPage() {
  const router = useRouter();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [preview, setPreview] = useState<{ src: string; label: string } | null>(null);

  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState('');
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadExpenses = () => {
    const url = categoryFilter === 'all' ? '/api/expenses' : `/api/expenses?category=${categoryFilter}`;
    setLoading(true);
    fetch(url)
      .then((res) => res.json())
      .then((data) => setExpenses(data.expenses || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadExpenses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryFilter]);

  const totalHkd = expenses.reduce((sum, e) => sum + (e.amount_hkd || 0), 0);
  const totalRmb = expenses.reduce((sum, e) => sum + (e.amount_rmb || 0), 0);
  const unpaidCount = expenses.filter((e) => e.payment_status !== 'paid').length;

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setReceiptPreview(null);
    setScanMessage('');
    setError('');
    setShowForm(true);
  };

  const openEdit = (e: Expense) => {
    setForm({
      category: e.category,
      merchant: e.merchant || '',
      amount_hkd: e.amount_hkd?.toString() || '',
      amount_rmb: e.amount_rmb?.toString() || '',
      paid_date: e.paid_date || '',
      order_no: e.order_no || '',
      platform: e.platform || '',
      notes: e.notes || '',
      payment_status: e.payment_status,
      receipt_path: e.receipt_path || '',
    });
    setEditingId(e.id);
    setReceiptPreview(e.receipt_path ? `/api/expenses/${e.id}/receipt` : null);
    setScanMessage('');
    setError('');
    setShowForm(true);
  };

  const handleScan = async (file: File) => {
    setScanning(true);
    setScanMessage('Scanning receipt…');
    setError('');
    setReceiptPreview(URL.createObjectURL(file));

    const fd = new FormData();
    fd.append('receipt', file);

    try {
      const res = await fetch('/api/expenses/scan', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to scan receipt');
        setScanMessage('');
        return;
      }
      const r = data.result;
      setForm((prev) => ({
        ...prev,
        merchant: r.merchant || prev.merchant,
        paid_date: r.date || prev.paid_date,
        amount_hkd: r.amount_hkd != null ? String(r.amount_hkd) : prev.amount_hkd,
        amount_rmb: r.amount_rmb != null ? String(r.amount_rmb) : prev.amount_rmb,
        receipt_path: r.receipt_path || prev.receipt_path,
      }));

      const found: string[] = [];
      if (r.merchant) found.push('merchant');
      if (r.date) found.push('date');
      if (r.amount_hkd != null) found.push('HKD');
      if (r.amount_rmb != null) found.push('RMB');
      const via = r.source === 'ai' ? 'AI vision' : 'OCR';
      setScanMessage(
        found.length
          ? `Extracted via ${via}: ${found.join(', ')}. Review and fill any blanks.`
          : `No fields could be extracted (${via}). Please enter the values manually.`
      );
    } catch {
      setError('Failed to scan receipt');
      setScanMessage('');
    } finally {
      setScanning(false);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleScan(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleScan(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.amount_hkd && !form.amount_rmb) {
      setError('Enter an amount in HKD or RMB');
      return;
    }
    setSaving(true);
    const url = editingId ? `/api/expenses/${editingId}` : '/api/expenses';
    const method = editingId ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error || 'Failed to save expense');
      return;
    }
    setShowForm(false);
    loadExpenses();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this expense?')) return;
    const res = await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      loadExpenses();
    }
  };

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = expenses.length > 0 && expenses.every((e) => selected.has(e.id));
  const toggleSelectAll = () => {
    setSelected(allSelected ? new Set() : new Set(expenses.map((e) => e.id)));
  };

  const printSelected = () => {
    if (!selected.size) return;
    const ids = expenses.filter((e) => selected.has(e.id)).map((e) => e.id);
    router.push(`/expenses/print?ids=${ids.join(',')}`);
  };

  const inputCls =
    'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm';

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Expenses 支出紀錄</h1>
          <p className="text-gray-500 mt-1">Track costs, scan receipts, and export your books</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={printSelected}
            disabled={selected.size === 0}
            className="px-4 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            🖨 Print Selected{selected.size > 0 ? ` (${selected.size})` : ''}
          </button>
          <a
            href="/api/expenses/export"
            className="px-4 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            ⬇ Export to Excel
          </a>
          <button
            onClick={openCreate}
            className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors"
          >
            + Add Expense
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard title="Total (HKD)" value={formatMoney(totalHkd, 'HKD')} icon="💰" color="bg-green-50 text-green-600" />
        <StatCard title="Total (RMB)" value={formatMoney(totalRmb, 'CNY')} icon="💴" color="bg-red-50 text-red-600" />
        <StatCard title="Records" value={String(expenses.length)} icon="🧾" />
        <StatCard title="Unpaid / Pending" value={String(unpaidCount)} icon="⏳" color="bg-yellow-50 text-yellow-600" />
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        <button
          onClick={() => setCategoryFilter('all')}
          className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
            categoryFilter === 'all' ? 'bg-brand-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          All
        </button>
        {EXPENSE_CATEGORIES.map((c) => (
          <button
            key={c.value}
            onClick={() => setCategoryFilter(c.value)}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              categoryFilter === c.value ? 'bg-brand-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        {loading ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600 mx-auto" />
          </div>
        ) : expenses.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <p>No expenses yet. Add one and scan a receipt to auto-fill the details.</p>
          </div>
        ) : (
          <table className="w-full min-w-[1000px]">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-200">
                <th className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                    aria-label="Select all"
                  />
                </th>
                <th className="px-4 py-3">Receipt No.</th>
                <th className="px-4 py-3">Receipt</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Merchant</th>
                <th className="px-4 py-3">HKD</th>
                <th className="px-4 py-3">RMB</th>
                <th className="px-4 py-3">Paid Date</th>
                <th className="px-4 py-3">Platform</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {expenses.map((e) => (
                <tr key={e.id} className={`hover:bg-gray-50 ${selected.has(e.id) ? 'bg-brand-50/40' : ''}`}>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(e.id)}
                      onChange={() => toggleSelect(e.id)}
                      className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                      aria-label={`Select ${e.receipt_no || e.id}`}
                    />
                  </td>
                  <td className="px-4 py-3 text-sm font-mono text-gray-700 whitespace-nowrap">{e.receipt_no || '—'}</td>
                  <td className="px-4 py-3">
                    {e.receipt_path ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/expenses/${e.id}/receipt`}
                        alt="Receipt thumbnail"
                        onClick={() => setPreview({ src: `/api/expenses/${e.id}/receipt`, label: e.receipt_no || '' })}
                        className="h-12 w-12 object-cover rounded border border-gray-200 cursor-pointer hover:ring-2 hover:ring-brand-400 transition"
                      />
                    ) : (
                      <span className="text-gray-300 text-xs">No image</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">{CATEGORY_LABELS[e.category] || e.category}</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{e.merchant || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{formatMoney(e.amount_hkd, 'HKD')}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{formatMoney(e.amount_rmb, 'CNY')}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{e.paid_date || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{e.platform || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${EXPENSE_STATUS_COLORS[e.payment_status]}`}>
                      {e.payment_status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm space-x-3 whitespace-nowrap">
                    <button onClick={() => openEdit(e)} className="text-brand-600 hover:text-brand-700 font-medium">Edit</button>
                    <button onClick={() => handleDelete(e.id)} className="text-red-600 hover:text-red-700 font-medium">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl w-full max-w-2xl p-6 shadow-xl my-8">
            <h2 className="text-lg font-semibold mb-4">{editingId ? 'Edit Expense' : 'New Expense'}</h2>
            {error && <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg">{error}</div>}

            <div
              onClick={() => fileInputRef.current?.click()}
              onDrop={onDrop}
              onDragOver={(ev) => ev.preventDefault()}
              className="mb-5 border-2 border-dashed border-gray-300 rounded-xl p-5 text-center cursor-pointer hover:border-brand-400 hover:bg-brand-50/40 transition-colors"
            >
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
              {receiptPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={receiptPreview} alt="Receipt preview" className="max-h-40 mx-auto rounded-lg mb-2" />
              ) : (
                <div className="text-3xl mb-1">📷</div>
              )}
              <p className="text-sm font-medium text-gray-700">
                {scanning ? 'Scanning…' : 'Scan Receipt 收據掃描 — click or drop an image'}
              </p>
              <p className="text-xs text-gray-400 mt-1">AI/OCR auto-extracts date, merchant &amp; amount</p>
              {scanMessage && <p className="text-xs text-brand-700 mt-2">{scanMessage}</p>}
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Category 類別</label>
                  <select value={form.category} onChange={(ev) => setForm({ ...form, category: ev.target.value })} className={inputCls}>
                    {EXPENSE_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Merchant 商戶</label>
                  <input value={form.merchant} onChange={(ev) => setForm({ ...form, merchant: ev.target.value })} className={inputCls} placeholder="Merchant name" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Amount (HKD) 港幣</label>
                  <input type="number" step="0.01" min="0" value={form.amount_hkd} onChange={(ev) => setForm({ ...form, amount_hkd: ev.target.value })} className={inputCls} placeholder="Leave blank if unknown" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Amount (RMB) 人民幣</label>
                  <input type="number" step="0.01" min="0" value={form.amount_rmb} onChange={(ev) => setForm({ ...form, amount_rmb: ev.target.value })} className={inputCls} placeholder="Leave blank if unknown" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Paid Date 付款日期</label>
                  <input type="date" value={form.paid_date} onChange={(ev) => setForm({ ...form, paid_date: ev.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Order No. 訂單編號</label>
                  <input value={form.order_no} onChange={(ev) => setForm({ ...form, order_no: ev.target.value })} className={inputCls} placeholder="Order / reference no." />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Platform 消費平台</label>
                  <input value={form.platform} onChange={(ev) => setForm({ ...form, platform: ev.target.value })} className={inputCls} placeholder="e.g. Taobao, Meituan, 淘寶" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Payment Status 付款狀態</label>
                  <select value={form.payment_status} onChange={(ev) => setForm({ ...form, payment_status: ev.target.value })} className={inputCls}>
                    {PAYMENT_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes 備註</label>
                <textarea value={form.notes} onChange={(ev) => setForm({ ...form, notes: ev.target.value })} rows={2} className={inputCls} placeholder="Optional notes" />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={saving} className="flex-1 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 font-medium">
                  {saving ? 'Saving…' : editingId ? 'Update Expense' : 'Create Expense'}
                </button>
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {preview && (
        <div
          onClick={() => setPreview(null)}
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4 cursor-zoom-out"
        >
          <div className="max-w-3xl w-full text-center" onClick={(ev) => ev.stopPropagation()}>
            {preview.label && (
              <div className="mb-2 inline-block bg-white/90 px-3 py-1 rounded-full text-sm font-mono font-semibold text-gray-800">
                {preview.label}
              </div>
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview.src} alt="Receipt preview" className="max-h-[80vh] w-auto mx-auto rounded-lg shadow-2xl bg-white" />
            <button
              onClick={() => setPreview(null)}
              className="mt-3 px-4 py-2 bg-white text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-100"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
