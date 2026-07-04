'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import { StatCard } from '@/components/ui';
import TagSelect from '@/components/TagSelect';
import FilterBar from '@/components/FilterBar';
import {
  PAYMENT_STATUSES,
  EXPENSE_STATUS_COLORS,
  categoryLabel,
  formatMoney,
  type OptionType,
} from '@/lib/expenses';
import type { Expense } from '@/lib/types';

const EMPTY_FORM = {
  category: '',
  merchant: '',
  amount_hkd: '',
  amount_rmb: '',
  paid_date: '',
  order_no: '',
  platform: '',
  payment_method: '',
  notes: '',
  payment_status: 'unpaid',
};

type FormState = typeof EMPTY_FORM;
type FormReceipt = { id?: number; path: string; url: string };
type Options = Record<OptionType, string[]>;
type SortKey = 'number' | 'reason' | 'supplier' | 'payment' | 'hkd' | 'rmb' | 'date' | 'platform' | 'status';

const EMPTY_FILTERS = { dateStart: '', dateEnd: '', paymentMethod: '', reason: '', platform: '', search: '' };

export default function ExpensesPage() {
  const router = useRouter();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formReceipts, setFormReceipts] = useState<FormReceipt[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [viewing, setViewing] = useState<Expense | null>(null);
  const [viewNotes, setViewNotes] = useState('');
  const [viewReceipts, setViewReceipts] = useState<FormReceipt[]>([]);
  const [viewUploadMsg, setViewUploadMsg] = useState('');
  const [viewSaving, setViewSaving] = useState(false);
  const [viewError, setViewError] = useState('');
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [options, setOptions] = useState<Options>({ payment_method: [], category: [], platform: [] });

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'date', dir: 'desc' });

  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState('');
  const [importing, setImporting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; kind: 'success' | 'error' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const viewFileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const loadExpenses = () => {
    setLoading(true);
    fetch('/api/expenses')
      .then((res) => res.json())
      .then((data) => setExpenses(data.expenses || []))
      .finally(() => setLoading(false));
  };

  const loadOptions = () => {
    fetch('/api/expense-options')
      .then((res) => res.json())
      .then((data) => data.options && setOptions(data.options))
      .catch(() => {});
  };

  useEffect(() => {
    loadExpenses();
    loadOptions();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const addOption = async (type: OptionType, value: string) => {
    const res = await fetch('/api/expense-options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, value }),
    });
    const data = await res.json();
    if (res.ok && data.options) setOptions((prev) => ({ ...prev, [type]: data.options }));
  };

  const reasonOptions = Array.from(new Set([...(options.category || []), ...expenses.map((e) => e.category).filter(Boolean)]));
  const paymentOptions = Array.from(new Set([...(options.payment_method || []), ...expenses.map((e) => e.payment_method).filter(Boolean) as string[]]));
  const platformOptions = Array.from(new Set([...(options.platform || []), ...expenses.map((e) => e.platform).filter(Boolean) as string[]]));

  const displayed = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    let list = expenses.filter((e) => {
      if (filters.dateStart && (!e.paid_date || e.paid_date < filters.dateStart)) return false;
      if (filters.dateEnd && (!e.paid_date || e.paid_date > filters.dateEnd)) return false;
      if (filters.paymentMethod && e.payment_method !== filters.paymentMethod) return false;
      if (filters.reason && e.category !== filters.reason) return false;
      if (filters.platform && e.platform !== filters.platform) return false;
      if (q) {
        const hay = [e.receipt_no, e.merchant, e.platform, e.payment_method, e.category]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const dir = sort.dir === 'asc' ? 1 : -1;
    list = [...list].sort((a, b) => {
      let base: number;
      switch (sort.key) {
        case 'number':
          base = String(a.receipt_no || '').localeCompare(String(b.receipt_no || ''));
          break;
        case 'reason':
          base = categoryLabel(a.category).localeCompare(categoryLabel(b.category));
          break;
        case 'supplier':
          base = String(a.merchant || '').localeCompare(String(b.merchant || ''));
          break;
        case 'payment':
          base = String(a.payment_method || '').localeCompare(String(b.payment_method || ''));
          break;
        case 'platform':
          base = String(a.platform || '').localeCompare(String(b.platform || ''));
          break;
        case 'status':
          base = String(a.payment_status).localeCompare(String(b.payment_status));
          break;
        case 'hkd':
          base = (a.amount_hkd ?? -Infinity) - (b.amount_hkd ?? -Infinity);
          break;
        case 'rmb':
          base = (a.amount_rmb ?? -Infinity) - (b.amount_rmb ?? -Infinity);
          break;
        default:
          base = (a.paid_date || a.created_at || '').localeCompare(b.paid_date || b.created_at || '');
      }
      return dir * base;
    });
    return list;
  }, [expenses, filters, sort]);

  const totalHkd = displayed.reduce((sum, e) => sum + (e.amount_hkd || 0), 0);
  const totalRmb = displayed.reduce((sum, e) => sum + (e.amount_rmb || 0), 0);
  const unpaidCount = displayed.filter((e) => e.payment_status !== 'paid').length;

  const toggleSort = (key: SortKey) => {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  };
  const arrow = (key: SortKey) => (sort.key === key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ' ↕');
  const sortTh = (key: SortKey, label: string) => (
    <th
      onClick={() => toggleSort(key)}
      className={`px-4 py-3 cursor-pointer select-none whitespace-nowrap hover:text-gray-700 ${sort.key === key ? 'text-brand-700' : ''}`}
    >
      {label}
      <span className="text-gray-400">{arrow(key)}</span>
    </th>
  );

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, category: options.category[0] || '' });
    setFormReceipts([]);
    setEditingId(null);
    setScanMessage('');
    setError('');
    setShowForm(true);
  };

  const openView = async (e: Expense) => {
    setViewing(e);
    setViewUploadMsg('');
    setViewError('');
    setViewNotes(e.notes || '');
    setViewReceipts((e.receipts || []).map((r) => ({ id: r.id, path: r.path, url: `/api/receipts/${r.id}` })));
    try {
      const res = await fetch(`/api/expenses/${e.id}`);
      const data = await res.json();
      if (res.ok && data.expense) {
        const fresh = data.expense as Expense;
        setViewing(fresh);
        setViewNotes(fresh.notes || '');
        setViewReceipts((fresh.receipts || []).map((r) => ({ id: r.id, path: r.path, url: `/api/receipts/${r.id}` })));
      }
    } catch { /* use list row data */ }
  };

  const handleViewFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (!files.length) return;
    setViewUploadMsg(`Uploading ${files.length} file(s)…`);
    setViewError('');
    const localUrls = files.map((f) => URL.createObjectURL(f));
    const fd = new FormData();
    files.forEach((f) => fd.append('receipt', f));
    try {
      const res = await fetch('/api/expenses/scan', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) { setViewError(data.error || 'Upload failed'); setViewUploadMsg(''); return; }
      const newReceipts: FormReceipt[] = (data.receipts || []).map(
        (r: { path: string }, i: number) => ({ path: r.path, url: localUrls[i] || '' })
      );
      setViewReceipts((prev) => [...prev, ...newReceipts]);
      setViewUploadMsg(`${newReceipts.length} receipt(s) attached.`);
    } catch {
      setViewError('Upload failed');
      setViewUploadMsg('');
    }
  };

  const saveView = async () => {
    if (!viewing) return;
    setViewSaving(true);
    setViewError('');
    const res = await fetch(`/api/expenses/${viewing.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: viewing.category,
        merchant: viewing.merchant,
        amount_hkd: viewing.amount_hkd,
        amount_rmb: viewing.amount_rmb,
        paid_date: viewing.paid_date,
        order_no: viewing.order_no,
        platform: viewing.platform,
        payment_method: viewing.payment_method,
        payment_status: viewing.payment_status,
        notes: viewNotes,
        receipt_paths: viewReceipts.map((r) => r.path),
      }),
    });
    const data = await res.json();
    setViewSaving(false);
    if (!res.ok) { setViewError(data.error || 'Failed to save'); return; }
    setViewing(null);
    loadExpenses();
  };

  const openEdit = (e: Expense) => {
    setForm({
      category: e.category || '',
      merchant: e.merchant || '',
      amount_hkd: e.amount_hkd?.toString() || '',
      amount_rmb: e.amount_rmb?.toString() || '',
      paid_date: e.paid_date || '',
      order_no: e.order_no || '',
      platform: e.platform || '',
      payment_method: e.payment_method || '',
      notes: e.notes || '',
      payment_status: e.payment_status,
    });
    setFormReceipts((e.receipts || []).map((r) => ({ id: r.id, path: r.path, url: `/api/receipts/${r.id}` })));
    setEditingId(e.id);
    setScanMessage('');
    setError('');
    setShowForm(true);
  };

  const handleFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (!files.length) return;
    setScanning(true);
    setScanMessage(`Uploading ${files.length} file${files.length > 1 ? 's' : ''} & scanning the first…`);
    setError('');

    const localUrls = files.map((f) => URL.createObjectURL(f));
    const fd = new FormData();
    files.forEach((f) => fd.append('receipt', f));

    try {
      const res = await fetch('/api/expenses/scan', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to scan receipts');
        setScanMessage('');
        return;
      }
      const newReceipts: FormReceipt[] = (data.receipts || []).map(
        (r: { path: string }, i: number) => ({ path: r.path, url: localUrls[i] || '' })
      );
      setFormReceipts((prev) => [...prev, ...newReceipts]);

      const r = data.result;
      if (r) {
        setForm((prev) => ({
          ...prev,
          merchant: prev.merchant || r.merchant || '',
          paid_date: prev.paid_date || r.date || '',
          amount_hkd: prev.amount_hkd || (r.amount_hkd != null ? String(r.amount_hkd) : ''),
          amount_rmb: prev.amount_rmb || (r.amount_rmb != null ? String(r.amount_rmb) : ''),
        }));
        const found: string[] = [];
        if (r.merchant) found.push('merchant');
        if (r.date) found.push('date');
        if (r.amount_hkd != null) found.push('HKD');
        if (r.amount_rmb != null) found.push('RMB');
        const via = r.source === 'ai' ? 'AI vision' : 'OCR';
        setScanMessage(
          found.length
            ? `${newReceipts.length} attached. Extracted from 1st file via ${via}: ${found.join(', ')}. Review & fill any blanks.`
            : `${newReceipts.length} attached. No fields auto-extracted (${via}). Enter values manually.`
        );
      } else {
        setScanMessage(`${newReceipts.length} file(s) attached.`);
      }
    } catch {
      setError('Failed to scan receipts');
      setScanMessage('');
    } finally {
      setScanning(false);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) handleFiles(e.target.files);
    e.target.value = '';
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
  };
  const removeFormReceipt = (idx: number) => setFormReceipts((prev) => prev.filter((_, i) => i !== idx));

  const handleImport = async (file: File) => {
    setImporting(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch('/api/expenses/import', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        setToast({ msg: data.error || 'Import failed', kind: 'error' });
        return;
      }
      let msg = `Imported ${data.imported} row(s), skipped ${data.skipped}`;
      if (data.tagsAdded?.length) msg += ` · added ${data.tagsAdded.length} new tag(s)`;
      setToast({ msg, kind: 'success' });
      loadOptions();
      loadExpenses();
    } catch {
      setToast({ msg: 'Import failed', kind: 'error' });
    } finally {
      setImporting(false);
    }
  };
  const onImportChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleImport(f);
    e.target.value = '';
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
      body: JSON.stringify({ ...form, receipt_paths: formReceipts.map((r) => r.path) }),
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
  const allSelected = displayed.length > 0 && displayed.every((e) => selected.has(e.id));
  const toggleSelectAll = () => setSelected(allSelected ? new Set() : new Set(displayed.map((e) => e.id)));

  const printSelected = () => {
    if (!selected.size) return;
    const ids = displayed.filter((e) => selected.has(e.id)).map((e) => e.id);
    router.push(`/expenses/print?ids=${ids.join(',')}`);
  };

  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm';
  const selectCls = 'px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none';

  const renderReceiptsCell = (e: Expense) => {
    const rs = e.receipts || [];
    if (!rs.length) return <span className="text-gray-300 text-xs whitespace-nowrap">— no image</span>;
    const shown = rs.length <= 3 ? rs : rs.slice(0, 2);
    const extra = rs.length <= 3 ? 0 : rs.length - 2;
    return (
      <div className="flex items-center gap-1">
        {shown.map((r) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={r.id}
            src={`/api/receipts/${r.id}`}
            alt="Receipt"
            onClick={() => openView(e)}
            className="h-10 w-10 object-cover rounded border border-gray-200 cursor-pointer hover:ring-2 hover:ring-brand-400 transition"
          />
        ))}
        {extra > 0 && (
          <button
            onClick={() => openView(e)}
            className="h-10 w-10 rounded border border-gray-200 bg-gray-100 text-gray-600 text-xs font-semibold hover:bg-gray-200"
          >
            +{extra}
          </button>
        )}
      </div>
    );
  };

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Expenses 支出紀錄</h1>
          <p className="text-gray-500 mt-1">Track costs, scan receipts, import sheets, and export your books</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={printSelected}
            disabled={selected.size === 0}
            className="px-4 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            🖨 Print Selected{selected.size > 0 ? ` (${selected.size})` : ''}
          </button>
          <div
            onClick={() => importInputRef.current?.click()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files?.[0]) handleImport(e.dataTransfer.files[0]);
            }}
            onDragOver={(e) => e.preventDefault()}
            className="px-4 py-2 bg-white border border-dashed border-brand-300 text-brand-700 text-sm font-medium rounded-lg hover:bg-brand-50 transition-colors cursor-pointer"
            title="Drag a .csv / .xlsx / .xls file here or click to select"
          >
            {importing ? 'Importing…' : '📥 Import Expense (CSV/Excel)'}
            <input ref={importInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={onImportChange} />
          </div>
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
        <StatCard title="Records" value={String(displayed.length)} icon="🧾" />
        <StatCard title="Unpaid / Pending" value={String(unpaidCount)} icon="⏳" color="bg-yellow-50 text-yellow-600" />
      </div>

      <FilterBar
        dateStart={filters.dateStart}
        dateEnd={filters.dateEnd}
        onDateStart={(v) => setFilters((f) => ({ ...f, dateStart: v }))}
        onDateEnd={(v) => setFilters((f) => ({ ...f, dateEnd: v }))}
        search={filters.search}
        onSearch={(v) => setFilters((f) => ({ ...f, search: v }))}
        searchPlaceholder="Search number, supplier, platform…"
        onClear={() => setFilters(EMPTY_FILTERS)}
      >
        <div className="flex flex-col">
          <label className="text-[11px] font-medium text-gray-500 mb-1">Payment 支付方式</label>
          <select value={filters.paymentMethod} onChange={(e) => setFilters((f) => ({ ...f, paymentMethod: e.target.value }))} className={selectCls}>
            <option value="">All</option>
            {paymentOptions.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-[11px] font-medium text-gray-500 mb-1">Reason 支出原因</label>
          <select value={filters.reason} onChange={(e) => setFilters((f) => ({ ...f, reason: e.target.value }))} className={selectCls}>
            <option value="">All</option>
            {reasonOptions.map((o) => <option key={o} value={o}>{categoryLabel(o)}</option>)}
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-[11px] font-medium text-gray-500 mb-1">Platform 消費平台</label>
          <select value={filters.platform} onChange={(e) => setFilters((f) => ({ ...f, platform: e.target.value }))} className={selectCls}>
            <option value="">All</option>
            {platformOptions.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      </FilterBar>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        {loading ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600 mx-auto" />
          </div>
        ) : displayed.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <p>No expenses match. Add one, import a sheet, or clear filters.</p>
          </div>
        ) : (
          <table className="w-full min-w-[1100px]">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-200">
                <th className="px-4 py-3">
                  <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer" aria-label="Select all" />
                </th>
                {sortTh('number', 'Receipt No.')}
                <th className="px-4 py-3">Receipts 付款收據</th>
                {sortTh('reason', 'Reason 支出原因')}
                {sortTh('supplier', 'Supplier 供應商')}
                {sortTh('payment', 'Payment 支付方式')}
                {sortTh('hkd', 'Amount HKD')}
                {sortTh('rmb', 'RMB')}
                {sortTh('date', 'Paid Date')}
                {sortTh('platform', 'Platform 消費平台')}
                {sortTh('status', 'Status')}
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {displayed.map((e) => (
                <tr key={e.id} className={`hover:bg-gray-50 ${selected.has(e.id) ? 'bg-brand-50/40' : ''}`}>
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggleSelect(e.id)} className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer" aria-label={`Select ${e.receipt_no || e.id}`} />
                  </td>
                  <td className="px-4 py-3 text-sm font-mono text-gray-700 whitespace-nowrap">
                    <button onClick={() => openView(e)} className="text-brand-600 hover:text-brand-700 font-mono font-medium">{e.receipt_no || '—'}</button>
                  </td>
                  <td className="px-4 py-3">{renderReceiptsCell(e)}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{categoryLabel(e.category)}</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    <button onClick={() => openView(e)} className="text-left hover:text-brand-600">{e.merchant || '—'}</button>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{e.payment_method || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{formatMoney(e.amount_hkd, 'HKD')}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{formatMoney(e.amount_rmb, 'CNY')}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{e.paid_date || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{e.platform || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${EXPENSE_STATUS_COLORS[e.payment_status]}`}>
                      {e.payment_status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm space-x-3 whitespace-nowrap">
                    <button onClick={() => openView(e)} className="text-gray-600 hover:text-gray-800 font-medium">View</button>
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
              className="mb-4 border-2 border-dashed border-gray-300 rounded-xl p-5 text-center cursor-pointer hover:border-brand-400 hover:bg-brand-50/40 transition-colors"
            >
              <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={onFileChange} />
              <div className="text-3xl mb-1">📎</div>
              <p className="text-sm font-medium text-gray-700">
                {scanning ? 'Scanning…' : 'Scan Receipts 收據掃描 — click or drop one or more images'}
              </p>
              <p className="text-xs text-gray-400 mt-1">Multiple files supported · OCR/AI reads the first file only</p>
              {scanMessage && <p className="text-xs text-brand-700 mt-2">{scanMessage}</p>}
            </div>

            {formReceipts.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {formReceipts.map((r, i) => (
                  <div key={i} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={r.url}
                      alt="Attached receipt"
                      onClick={() => setLightbox(r.url)}
                      className="h-16 w-16 object-cover rounded-lg border border-gray-200 cursor-zoom-in hover:ring-2 hover:ring-brand-400"
                      title="Click to enlarge"
                    />
                    <button
                      type="button"
                      onClick={() => removeFormReceipt(i)}
                      className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center hover:bg-red-600"
                      aria-label="Remove receipt"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Expense Reason 支出原因</label>
                  <TagSelect value={form.category} options={options.category} onChange={(v) => setForm((f) => ({ ...f, category: v }))} onAdd={(v) => addOption('category', v)} placeholder="Select or add a reason" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Supplier 供應商</label>
                  <input value={form.merchant} onChange={(ev) => setForm({ ...form, merchant: ev.target.value })} className={inputCls} placeholder="Supplier / merchant name" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Payment Method 支付方式</label>
                  <TagSelect value={form.payment_method} options={options.payment_method} onChange={(v) => setForm((f) => ({ ...f, payment_method: v }))} onAdd={(v) => addOption('payment_method', v)} placeholder="Select or add a method" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Shopping Platform 消費平台</label>
                  <TagSelect value={form.platform} options={options.platform} onChange={(v) => setForm((f) => ({ ...f, platform: v }))} onAdd={(v) => addOption('platform', v)} placeholder="Select or add a platform" />
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
                  <label className="block text-xs font-medium text-gray-600 mb-1">Paid Date 支出日期</label>
                  <input type="date" value={form.paid_date} onChange={(ev) => setForm({ ...form, paid_date: ev.target.value })} className={inputCls} />
                  <p className="text-[11px] text-gray-400 mt-1">Receipt No. uses this month (EXP-YYYYMM-XXX)</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Order No. 訂單編號</label>
                  <input value={form.order_no} onChange={(ev) => setForm({ ...form, order_no: ev.target.value })} className={inputCls} placeholder="Order / reference no." />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Payment Status 付款狀態</label>
                  <select value={form.payment_status} onChange={(ev) => setForm({ ...form, payment_status: ev.target.value })} className={inputCls}>
                    {PAYMENT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
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

      {viewing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4 overflow-y-auto" onClick={() => setViewing(null)}>
          <div className="bg-white rounded-xl w-full max-w-2xl my-8 p-6 shadow-xl max-h-[92vh] overflow-y-auto" onClick={(ev) => ev.stopPropagation()}>
            <div className="flex items-start justify-between mb-4 gap-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-gray-400">Expense Detail 支出詳情</p>
                <h2 className="text-xl font-bold font-mono text-gray-900">{viewing.receipt_no || `EXP-${viewing.id}`}</h2>
                <p className="text-sm text-gray-500 mt-0.5">{categoryLabel(viewing.category)} · {viewing.merchant || 'Unnamed'}</p>
              </div>
              <button onClick={() => setViewing(null)} className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200">Close</button>
            </div>

            {viewError && <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg">{viewError}</div>}

            <div className="grid grid-cols-2 gap-3 mb-5 text-sm">
              <div><span className="text-gray-400 text-xs block">Payment 支付方式</span>{viewing.payment_method || '—'}</div>
              <div><span className="text-gray-400 text-xs block">Platform 消費平台</span>{viewing.platform || '—'}</div>
              <div><span className="text-gray-400 text-xs block">Amount HKD</span>{formatMoney(viewing.amount_hkd, 'HKD')}</div>
              <div><span className="text-gray-400 text-xs block">Amount RMB</span>{formatMoney(viewing.amount_rmb, 'CNY')}</div>
              <div><span className="text-gray-400 text-xs block">Paid Date</span>{viewing.paid_date || '—'}</div>
              <div><span className="text-gray-400 text-xs block">Order No.</span>{viewing.order_no || '—'}</div>
              <div className="col-span-2">
                <span className="text-gray-400 text-xs block">Status</span>
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${EXPENSE_STATUS_COLORS[viewing.payment_status]}`}>{viewing.payment_status}</span>
              </div>
            </div>

            <div className="mb-4">
              <p className="text-xs font-medium text-gray-600 mb-2">Receipts 付款收據</p>
              {viewReceipts.length > 0 ? (
                <div className="flex flex-wrap gap-2 mb-3">
                  {viewReceipts.map((r, i) => (
                    <div key={i} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={r.url} alt="Receipt" onClick={() => setLightbox(r.url)} className="h-20 w-20 object-cover rounded-lg border border-gray-200 cursor-zoom-in hover:ring-2 hover:ring-brand-400" />
                      <button type="button" onClick={() => setViewReceipts((prev) => prev.filter((_, j) => j !== i))} className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">×</button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400 mb-3">No receipt images yet.</p>
              )}
              <div
                onClick={() => viewFileInputRef.current?.click()}
                onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files?.length) handleViewFiles(e.dataTransfer.files); }}
                onDragOver={(e) => e.preventDefault()}
                className="border-2 border-dashed border-gray-300 rounded-xl p-4 text-center cursor-pointer hover:border-brand-400 hover:bg-brand-50/40"
              >
                <input ref={viewFileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) handleViewFiles(e.target.files); e.target.value = ''; }} />
                <div className="text-xl mb-1">📎</div>
                <p className="text-xs text-gray-600">Upload / drop receipt images</p>
                {viewUploadMsg && <p className="text-[11px] text-brand-700 mt-1">{viewUploadMsg}</p>}
              </div>
            </div>

            <div className="mb-5">
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes 備註</label>
              <textarea value={viewNotes} onChange={(e) => setViewNotes(e.target.value)} rows={3} className={inputCls} placeholder="Add or update notes…" />
            </div>

            <div className="flex gap-3">
              <button onClick={saveView} disabled={viewSaving} className="flex-1 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 font-medium">{viewSaving ? 'Saving…' : 'Save Updates'}</button>
              <button onClick={() => { const e = viewing; setViewing(null); openEdit(e); }} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium text-sm">Full Edit</button>
            </div>
          </div>
        </div>
      )}

      {lightbox && (
        <div onClick={() => setLightbox(null)} className="fixed inset-0 bg-black/80 flex items-center justify-center z-[70] p-4 cursor-zoom-out">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="Enlarged receipt" className="max-h-[92vh] max-w-[92vw] object-contain rounded-lg shadow-2xl bg-white" />
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-6 right-6 z-[80] px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${toast.kind === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.msg}
        </div>
      )}
    </AppLayout>
  );
}
