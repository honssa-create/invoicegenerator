'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import { StatCard } from '@/components/ui';
import TagSelect from '@/components/TagSelect';
import SupplierSelect from '@/components/SupplierSelect';
import FilterBar from '@/components/FilterBar';
import {
  DEFAULT_OPTIONS,
  OPTION_TYPES,
  EXPENSE_STATUS_COLORS,
  categoryLabel,
  expenseSupplierName,
  formatMoney,
  type OptionType,
} from '@/lib/expenses';
import {
  matchSupplierFromOcr,
  mergeSupplierLists,
  SUPPLIER_OCR_AUTO_FILL_THRESHOLD,
  type SupplierMatch,
} from '@/lib/expense-suppliers';
import type { Expense } from '@/lib/types';
import { expenseReceiptUrl, isStoredImageUrl } from '@/lib/image-url';

const EMPTY_FORM = {
  category: '',
  merchant: '',
  supplier_input: '',
  amount_hkd: '',
  amount_rmb: '',
  paid_date: '',
  order_no: '',
  platform: '',
  payment_method: '',
  notes: '',
  special_notes: '',
};

type FormState = typeof EMPTY_FORM;
type FormReceipt = { id?: number; path: string; url: string };
type Options = Record<OptionType, string[]>;
type SortKey = 'number' | 'reason' | 'supplier' | 'payment' | 'hkd' | 'rmb' | 'date' | 'platform' | 'status';

const EMPTY_FILTERS = { dateStart: '', dateEnd: '', paymentMethod: '', reason: '', platform: '', search: '' };

function cloneDefaultOptions(): Options {
  return {
    payment_method: [...DEFAULT_OPTIONS.payment_method],
    category: [...DEFAULT_OPTIONS.category],
    platform: [...DEFAULT_OPTIONS.platform],
    supplier: [...DEFAULT_OPTIONS.supplier],
  };
}

function normalizeOptions(raw?: Partial<Options>): Options {
  const result = cloneDefaultOptions();
  if (!raw) return result;
  for (const type of OPTION_TYPES) {
    const list = raw[type];
    if (Array.isArray(list) && list.length) result[type] = list;
  }
  return result;
}

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
  const [detail, setDetail] = useState<Expense | null>(null);
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);
  const [options, setOptions] = useState<Options>(cloneDefaultOptions);
  const [supplierOcrMatch, setSupplierOcrMatch] = useState<SupplierMatch | null>(null);
  const [supplierInputOcrHint, setSupplierInputOcrHint] = useState(false);

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'date', dir: 'desc' });

  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState('');
  const [importing, setImporting] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; kind: 'success' | 'error' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const loadExpenses = () => {
    setLoading(true);
    fetch('/api/expenses')
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) {
          setToast({ msg: data.error || 'Failed to load expenses', kind: 'error' });
          setExpenses([]);
          return;
        }
        setExpenses(data.expenses || []);
      })
      .catch(() => {
        setToast({ msg: 'Failed to load expenses', kind: 'error' });
        setExpenses([]);
      })
      .finally(() => setLoading(false));
  };

  const loadOptions = () => {
    fetch('/api/expense-options')
      .then((res) => res.json())
      .then((data) => {
        if (data.options) setOptions(normalizeOptions(data.options));
      })
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
    if (res.ok && data.options) {
      setOptions((prev) => normalizeOptions({ ...prev, [type]: data.options }));
    }
  };

  const reasonOptions = Array.from(new Set([...(options.category || []), ...expenses.map((e) => e.category).filter(Boolean)]));
  const paymentOptions = Array.from(new Set([...(options.payment_method || []), ...expenses.map((e) => e.payment_method).filter(Boolean) as string[]]));
  const platformOptions = Array.from(new Set([...(options.platform || []), ...expenses.map((e) => e.platform).filter(Boolean) as string[]]));
  const supplierOptions = useMemo(
    () => mergeSupplierLists(options.supplier, expenses.map((e) => e.merchant)),
    [options.supplier, expenses]
  );

  const displayed = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    let list = expenses.filter((e) => {
      if (filters.dateStart && (!e.paid_date || e.paid_date < filters.dateStart)) return false;
      if (filters.dateEnd && (!e.paid_date || e.paid_date > filters.dateEnd)) return false;
      if (filters.paymentMethod && e.payment_method !== filters.paymentMethod) return false;
      if (filters.reason && e.category !== filters.reason) return false;
      if (filters.platform && e.platform !== filters.platform) return false;
      if (q) {
        const hay = [e.receipt_no, e.merchant, e.supplier_input, e.platform, e.payment_method, e.category, e.notes, e.special_notes]
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
          base = expenseSupplierName(a).localeCompare(expenseSupplierName(b));
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
  const sortTh = (key: SortKey, label: string, className = '') => (
    <th
      onClick={() => toggleSort(key)}
      className={`px-4 py-3 cursor-pointer select-none whitespace-nowrap hover:text-gray-700 ${sort.key === key ? 'text-brand-700' : ''} ${className}`}
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
    setSupplierOcrMatch(null);
    setSupplierInputOcrHint(false);
    setError('');
    setShowForm(true);
  };

  const openEdit = (e: Expense) => {
    setForm({
      category: e.category || '',
      merchant: e.merchant || '',
      supplier_input: e.supplier_input || '',
      amount_hkd: e.amount_hkd?.toString() || '',
      amount_rmb: e.amount_rmb?.toString() || '',
      paid_date: e.paid_date || '',
      order_no: e.order_no || '',
      platform: e.platform || '',
      payment_method: e.payment_method || '',
      notes: e.notes || '',
      special_notes: e.special_notes || '',
    });
    setFormReceipts((e.receipts || []).map((r) => ({ id: r.id, path: r.path, url: expenseReceiptUrl(r) })));
    setEditingId(e.id);
    setScanMessage('');
    setSupplierOcrMatch(null);
    setSupplierInputOcrHint(false);
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
        (r: { path: string }, i: number) => ({
          path: r.path,
          url: isStoredImageUrl(r.path) ? r.path : (localUrls[i] || r.path),
        })
      );
      setFormReceipts((prev) => [...prev, ...newReceipts]);

      const r = data.result;
      if (r) {
        const supplierList = mergeSupplierLists(options.supplier, expenses.map((ex) => ex.merchant));
        const ocrBlob = [r.merchant, r.raw_text].filter(Boolean).join('\n');
        const supplierMatch = ocrBlob ? matchSupplierFromOcr(ocrBlob, supplierList) : null;
        const matchedDropdown =
          supplierMatch && supplierMatch.score >= SUPPLIER_OCR_AUTO_FILL_THRESHOLD;
        const ocrSupplierText = r.merchant?.trim() || '';

        let showOcrMatch = false;
        let showInputOcrHint = false;
        setForm((prev) => {
          const next = {
            ...prev,
            paid_date: prev.paid_date || r.date || '',
            amount_hkd: prev.amount_hkd || (r.amount_hkd != null ? String(r.amount_hkd) : ''),
            amount_rmb: prev.amount_rmb || (r.amount_rmb != null ? String(r.amount_rmb) : ''),
          };
          if (!prev.merchant && !prev.supplier_input) {
            if (matchedDropdown) {
              showOcrMatch = true;
              next.merchant = supplierMatch!.supplier;
              next.supplier_input = '';
            } else if (ocrSupplierText) {
              showInputOcrHint = true;
              next.supplier_input = ocrSupplierText;
              next.merchant = '';
            }
          }
          return next;
        });
        setSupplierOcrMatch(showOcrMatch ? supplierMatch : null);
        setSupplierInputOcrHint(showInputOcrHint);

        const found: string[] = [];
        if (matchedDropdown) found.push('supplier (list)');
        else if (ocrSupplierText) found.push('supplier (one-time)');
        if (r.date) found.push('date');
        if (r.amount_hkd != null) found.push('HKD');
        if (r.amount_rmb != null) found.push('RMB');
        const via = r.source === 'ai' ? 'AI vision' : 'OCR';
        const supplierNote = matchedDropdown
          ? ` · supplier matched (${Math.round(supplierMatch!.score * 100)}%)`
          : ocrSupplierText
            ? ' · one-time supplier filled (not in list)'
            : '';
        setScanMessage(
          found.length
            ? `${newReceipts.length} attached. Extracted from 1st file via ${via}: ${found.join(', ')}${supplierNote}. Review & fill any blanks.`
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
      if (data.receipt_fetched) msg += ` · ${data.receipt_fetched} receipt image(s) downloaded`;
      if (data.receipt_failed) msg += ` · ${data.receipt_failed} receipt link(s) failed`;
      if (data.tagsAdded?.length) msg += ` · added ${data.tagsAdded.length} new tag(s)`;
      if (data.receipt_warnings?.length) {
        console.warn('Expense import receipt warnings:', data.receipt_warnings);
        const preview = data.receipt_warnings.slice(0, 2).join(' · ');
        msg += ` · ${preview}`;
      }
      const kind =
        data.receipt_failed && !data.imported
          ? 'error'
          : data.receipt_failed && data.imported
            ? 'success'
            : 'success';
      setToast({ msg, kind });
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
      body: JSON.stringify({ ...form, payment_status: 'paid', receipt_paths: formReceipts.map((r) => r.path) }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error || 'Failed to save expense');
      return;
    }
    setShowForm(false);
    setSupplierOcrMatch(null);
    setSupplierInputOcrHint(false);
    loadExpenses();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Move this expense to Deleted Records? You can restore it within 60 days.')) return;
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

  const openDetail = (e: Expense) => setDetail(e);

  const openLightbox = (expense: Expense, index: number) => {
    const receipts = expense.receipts || [];
    if (!receipts[index]) return;
    setLightbox({
      urls: receipts.map((r) => expenseReceiptUrl(r)),
      index,
    });
  };

  const stepLightbox = (delta: number) => {
    if (!lightbox) return;
    const next = (lightbox.index + delta + lightbox.urls.length) % lightbox.urls.length;
    setLightbox({ ...lightbox, index: next });
  };

  const printSelected = () => {
    if (!selected.size) return;
    const ids = displayed.filter((e) => selected.has(e.id)).map((e) => e.id);
    router.push(`/expenses/print?ids=${ids.join(',')}`);
  };

  const deleteSelected = async () => {
    if (!selected.size) return;
    const ids = displayed.filter((e) => selected.has(e.id)).map((e) => e.id);
    if (
      !confirm(
        `Move ${ids.length} expense(s) to Deleted Records? You can restore them within 60 days.`
      )
    ) {
      return;
    }
    setBulkDeleting(true);
    try {
      const res = await fetch('/api/expenses/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json();
      if (!res.ok) {
        setToast({ msg: data.error || 'Bulk delete failed', kind: 'error' });
        return;
      }
      setSelected(new Set());
      if (detail && ids.includes(detail.id)) setDetail(null);
      loadExpenses();
      let msg = `Moved ${data.deleted} expense(s) to Deleted Records`;
      if (data.not_found?.length) msg += ` · ${data.not_found.length} skipped (not found or no access)`;
      setToast({ msg, kind: 'success' });
    } catch {
      setToast({ msg: 'Bulk delete failed', kind: 'error' });
    } finally {
      setBulkDeleting(false);
    }
  };

  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm';
  const selectCls = 'px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none';

  const renderReceiptsCell = (e: Expense) => {
    const rs = e.receipts || [];
    if (!rs.length) return <span className="text-gray-300 text-xs whitespace-nowrap">— no image</span>;
    const shown = rs.length <= 3 ? rs : rs.slice(0, 2);
    const extra = rs.length <= 3 ? 0 : rs.length - 2;
    return (
      <div className="flex items-center gap-1" onClick={(ev) => ev.stopPropagation()}>
        {shown.map((r, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={r.id}
            src={expenseReceiptUrl(r)}
            alt="Receipt"
            onClick={() => openLightbox(e, i)}
            className="h-10 w-10 object-cover rounded border border-gray-200 cursor-zoom-in hover:ring-2 hover:ring-brand-400 transition"
            title="Click to enlarge"
          />
        ))}
        {extra > 0 && (
          <button
            type="button"
            onClick={() => openDetail(e)}
            className="h-10 w-10 rounded border border-gray-200 bg-gray-100 text-gray-600 text-xs font-semibold hover:bg-gray-200"
          >
            +{extra}
          </button>
        )}
      </div>
    );
  };

  const detailField = (label: string, value: ReactNode) => (
    <div>
      <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-sm text-gray-900 mt-0.5">{value || '—'}</p>
    </div>
  );

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">Expenses 支出紀錄</h1>
          <p className="text-gray-500 mt-1 text-sm sm:text-base">Track costs, scan receipts, import sheets, and export your books</p>
        </div>
        <div className="page-actions">
          <button
            onClick={deleteSelected}
            disabled={selected.size === 0 || bulkDeleting}
            className="px-4 py-2 bg-white border border-red-200 text-red-700 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {bulkDeleting ? 'Deleting…' : `🗑 Delete Selected${selected.size > 0 ? ` (${selected.size})` : ''}`}
          </button>
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
          <table className="w-full min-w-[1400px] border-separate border-spacing-0">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-200">
                <th className="px-4 py-3 sticky left-0 z-20 bg-white w-14 min-w-14 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">
                  <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer" aria-label="Select all" />
                </th>
                {sortTh('number', 'Receipt No.', 'sticky left-14 z-20 bg-white min-w-[7.5rem] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]')}
                {sortTh('date', 'Paid Date')}
                {sortTh('platform', 'Platform 消費平台')}
                {sortTh('supplier', 'Supplier 供應商')}
                <th className="px-4 py-3 whitespace-nowrap">Notes 注意事項</th>
                {sortTh('rmb', '支出金額(RMB)')}
                {sortTh('hkd', '支出金額(HKD)')}
                {sortTh('payment', 'Payment 支付方式')}
                {sortTh('reason', 'Reason 支出原因')}
                <th className="px-4 py-3 whitespace-nowrap">Receipts 付款收據</th>
                <th className="px-4 py-3 whitespace-nowrap min-w-[120px]">Special Notes 特別事項</th>
                {sortTh('status', 'Status')}
                <th className="px-4 py-3 sticky right-0 z-20 bg-white whitespace-nowrap shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.08)]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {displayed.map((e) => {
                const rowBg = selected.has(e.id) ? 'bg-brand-50/40' : 'bg-white';
                const stickyCell = `${rowBg} group-hover:bg-gray-50`;
                return (
                <tr
                  key={e.id}
                  onClick={() => openDetail(e)}
                  className={`group hover:bg-gray-50 cursor-pointer ${selected.has(e.id) ? 'bg-brand-50/40' : ''}`}
                >
                  <td className={`px-4 py-3 sticky left-0 z-10 w-14 min-w-14 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)] ${stickyCell}`} onClick={(ev) => ev.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggleSelect(e.id)} className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer" aria-label={`Select ${e.receipt_no || e.id}`} />
                  </td>
                  <td className={`px-4 py-3 sticky left-14 z-10 min-w-[7.5rem] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)] text-sm font-mono text-brand-700 whitespace-nowrap font-medium ${stickyCell}`}>{e.receipt_no || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{e.paid_date || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{e.platform || '—'}</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 max-w-[160px] truncate" title={expenseSupplierName(e)}>{expenseSupplierName(e) || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 max-w-[180px] truncate" title={e.notes || ''}>{e.notes || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{formatMoney(e.amount_rmb, 'CNY')}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{formatMoney(e.amount_hkd, 'HKD')}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{e.payment_method || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{categoryLabel(e.category)}</td>
                  <td className="px-4 py-3">{renderReceiptsCell(e)}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 max-w-[180px] truncate" title={e.special_notes || ''}>{e.special_notes || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${EXPENSE_STATUS_COLORS[e.payment_status]}`}>
                      {e.payment_status}
                    </span>
                  </td>
                  <td className={`px-4 py-3 sticky right-0 z-10 shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.08)] text-sm space-x-3 whitespace-nowrap ${stickyCell}`} onClick={(ev) => ev.stopPropagation()}>
                    <button onClick={() => openDetail(e)} className="text-gray-600 hover:text-gray-900 font-medium">View</button>
                    <button onClick={() => openEdit(e)} className="text-brand-600 hover:text-brand-700 font-medium">Edit</button>
                    <button onClick={() => handleDelete(e.id)} className="text-red-600 hover:text-red-700 font-medium">Delete</button>
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <div className="modal-overlay overflow-y-auto py-4">
          <div className="modal-panel sm:max-w-2xl my-0 sm:my-8 !overflow-visible max-h-none">
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
                      onClick={() => setLightbox({ urls: formReceipts.map((x) => x.url), index: i })}
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
                  <label className="block text-xs font-medium text-gray-600 mb-1">Paid Date 支出日期</label>
                  <input type="date" value={form.paid_date} onChange={(ev) => setForm({ ...form, paid_date: ev.target.value })} className={inputCls} />
                  <p className="text-[11px] text-gray-400 mt-1">Receipt No. uses this month (EXP-YYYYMM-XXX)</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Shopping Platform 消費平台</label>
                  <TagSelect value={form.platform} options={options.platform || []} onChange={(v) => setForm((f) => ({ ...f, platform: v }))} onAdd={(v) => addOption('platform', v)} placeholder="Select or add a platform" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Supplier 供應商</label>
                  <SupplierSelect
                    value={form.merchant}
                    options={supplierOptions}
                    onChange={(v) => setForm((f) => ({ ...f, merchant: v, supplier_input: v ? '' : f.supplier_input }))}
                    onAdd={(v) => addOption('supplier', v)}
                    ocrMatch={supplierOcrMatch}
                    onDismissOcrMatch={() => setSupplierOcrMatch(null)}
                    placeholder="Select supplier 供應商…"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">供應商 (input)</label>
                  {supplierInputOcrHint && form.supplier_input && (
                    <div className="mb-1.5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
                      <span className="shrink-0" aria-hidden>✨</span>
                      <span className="flex-1">
                        One-time supplier from receipt: <strong>{form.supplier_input}</strong> (not added to list)
                      </span>
                      <button
                        type="button"
                        onClick={() => setSupplierInputOcrHint(false)}
                        className="shrink-0 text-amber-700 hover:text-amber-900 font-medium"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}
                  <input
                    value={form.supplier_input}
                    onChange={(ev) => {
                      const v = ev.target.value;
                      setForm((f) => ({ ...f, supplier_input: v, merchant: v.trim() ? '' : f.merchant }));
                      if (v.trim()) setSupplierInputOcrHint(false);
                    }}
                    className={`${inputCls} ${supplierInputOcrHint && form.supplier_input ? 'ring-2 ring-amber-400 border-amber-300 bg-amber-50/40' : ''}`}
                    placeholder="One-time supplier — not saved to dropdown list"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">Use when the supplier is not in the list above</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Expense Reason 支出原因</label>
                  <TagSelect value={form.category} options={options.category || []} onChange={(v) => setForm((f) => ({ ...f, category: v }))} onAdd={(v) => addOption('category', v)} placeholder="Select or add a reason" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Payment Method 支付方式</label>
                  <TagSelect value={form.payment_method} options={options.payment_method || []} onChange={(v) => setForm((f) => ({ ...f, payment_method: v }))} onAdd={(v) => addOption('payment_method', v)} placeholder="Select or add a method" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">支出金額(RMB)</label>
                  <input type="number" step="0.01" min="0" value={form.amount_rmb} onChange={(ev) => setForm({ ...form, amount_rmb: ev.target.value })} className={inputCls} placeholder="Leave blank if unknown" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">支出金額(HKD)</label>
                  <input type="number" step="0.01" min="0" value={form.amount_hkd} onChange={(ev) => setForm({ ...form, amount_hkd: ev.target.value })} className={inputCls} placeholder="Leave blank if unknown" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Order No. 訂單編號</label>
                  <input value={form.order_no} onChange={(ev) => setForm({ ...form, order_no: ev.target.value })} className={inputCls} placeholder="Order / reference no." />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes 注意事項</label>
                <textarea value={form.notes} onChange={(ev) => setForm({ ...form, notes: ev.target.value })} rows={2} className={inputCls} placeholder="General notes for this expense" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Special Notes 特別事項</label>
                <textarea value={form.special_notes} onChange={(ev) => setForm({ ...form, special_notes: ev.target.value })} rows={2} className={inputCls} placeholder="Special remarks or follow-up notes" />
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

      {detail && (
        <div className="modal-overlay overflow-y-auto" onClick={() => setDetail(null)}>
          <div
            className="modal-panel sm:max-w-3xl my-0 sm:my-8"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <p className="text-[11px] uppercase tracking-widest text-brand-600 font-semibold">Expense Detail 支出詳情</p>
                <h2 className="text-xl sm:text-2xl font-bold font-mono text-gray-900 mt-1">{detail.receipt_no || `EXP-${detail.id}`}</h2>
                <p className="text-sm text-gray-500 mt-1">{expenseSupplierName(detail) || 'Unnamed supplier'}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => { setDetail(null); openEdit(detail); }}
                  className="px-3 py-2 text-sm font-medium text-brand-600 border border-brand-200 rounded-lg hover:bg-brand-50"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setDetail(null)}
                  className="px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6 p-4 bg-gray-50 rounded-xl border border-gray-100">
              {detailField('Paid Date 支出日期', detail.paid_date)}
              {detailField('Platform 消費平台', detail.platform)}
              {detailField('Supplier 供應商', detail.merchant)}
              {detail.supplier_input && detailField('供應商 (input)', detail.supplier_input)}
              {detailField('支出金額(RMB)', formatMoney(detail.amount_rmb, 'CNY'))}
              {detailField('支出金額(HKD)', formatMoney(detail.amount_hkd, 'HKD'))}
              {detailField('Payment 支付方式', detail.payment_method)}
              {detailField('Reason 支出原因', categoryLabel(detail.category))}
              {detailField('Order No. 訂單編號', detail.order_no)}
              <div>
                <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Status 付款狀態</p>
                <span className={`inline-flex mt-1 px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${EXPENSE_STATUS_COLORS[detail.payment_status]}`}>
                  {detail.payment_status}
                </span>
              </div>
            </div>

            {detail.notes && (
              <div className="mb-4">
                <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-1">Notes 注意事項</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap bg-white border border-gray-200 rounded-lg p-3">{detail.notes}</p>
              </div>
            )}

            {detail.special_notes && (
              <div className="mb-6">
                <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-1">Special Notes 特別事項</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap bg-white border border-gray-200 rounded-lg p-3">{detail.special_notes}</p>
              </div>
            )}

            {!detail.notes && !detail.special_notes && <div className="mb-6" />}

            <div>
              <p className="text-sm font-semibold text-gray-900 mb-3">
                Receipt Images 付款收據 ({(detail.receipts || []).length})
              </p>
              {(detail.receipts || []).length === 0 ? (
                <p className="text-gray-400 text-sm py-8 text-center border border-dashed border-gray-200 rounded-xl">No receipt images attached.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {(detail.receipts || []).map((r, i) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => openLightbox(detail, i)}
                      className="group text-left border border-gray-200 rounded-xl overflow-hidden hover:ring-2 hover:ring-brand-400 transition-shadow bg-white"
                    >
                      <div className="bg-brand-50 px-3 py-1.5 text-xs font-mono font-semibold text-brand-800 border-b border-brand-100 flex items-center justify-between">
                        <span>{detail.receipt_no || `EXP-${detail.id}`} · #{i + 1}</span>
                        <span className="text-brand-600 opacity-0 group-hover:opacity-100 transition-opacity">🔍 Enlarge</span>
                      </div>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={expenseReceiptUrl(r)}
                        alt={`Receipt ${i + 1}`}
                        className="w-full object-contain max-h-[45vh] bg-gray-50"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 bg-black/90 flex items-center justify-center z-[80] p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 z-10 h-10 w-10 rounded-full bg-white/10 text-white text-xl hover:bg-white/20"
            aria-label="Close"
          >
            ×
          </button>
          {lightbox.urls.length > 1 && (
            <>
              <button
                type="button"
                onClick={(ev) => { ev.stopPropagation(); stepLightbox(-1); }}
                className="absolute left-2 sm:left-6 z-10 h-12 w-12 rounded-full bg-white/10 text-white text-2xl hover:bg-white/20"
                aria-label="Previous image"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={(ev) => { ev.stopPropagation(); stepLightbox(1); }}
                className="absolute right-2 sm:right-6 z-10 h-12 w-12 rounded-full bg-white/10 text-white text-2xl hover:bg-white/20"
                aria-label="Next image"
              >
                ›
              </button>
              <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/80 text-sm">
                {lightbox.index + 1} / {lightbox.urls.length}
              </p>
            </>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox.urls[lightbox.index]}
            alt="Receipt enlarged"
            onClick={(ev) => ev.stopPropagation()}
            className="max-h-[92vh] max-w-[92vw] object-contain rounded-lg shadow-2xl bg-white cursor-default"
          />
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
