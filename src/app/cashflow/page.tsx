'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import { StatCard } from '@/components/ui';
import { compressImage } from '@/lib/imageCompression';
import { compressPdfToImages } from '@/lib/pdfCompression';
import type { BankImportResponse, ConfirmMatchPayload } from '@/lib/bank-statement';
import type { Order } from '@/lib/orders';
import {
  INCOME_CATEGORIES,
  RECEIVED_ACCOUNTS,
  currentMonth,
  formatMoney,
  type CashflowResponse,
  type LedgerEntry,
} from '@/lib/cashflow';

const EMPTY_FORM = { category: INCOME_CATEGORIES[0], txn_date: new Date().toISOString().slice(0, 10), amount: '', account: RECEIVED_ACCOUNTS[0], remarks: '' };

export default function CashflowPage() {
  const [data, setData] = useState<CashflowResponse | null>(null);
  const [month, setMonth] = useState(currentMonth());
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [receiptPath, setReceiptPath] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [uploadMsg, setUploadMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [lightbox, setLightbox] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bankFileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<BankImportResponse | null>(null);
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<number>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [viewEntry, setViewEntry] = useState<LedgerEntry | null>(null);
  const [viewNotes, setViewNotes] = useState('');
  const [viewReceiptUrl, setViewReceiptUrl] = useState<string | null>(null);
  const [viewReceiptPath, setViewReceiptPath] = useState('');
  const [viewOrder, setViewOrder] = useState<Order | null>(null);
  const [viewIncome, setViewIncome] = useState<Record<string, unknown> | null>(null);
  const [viewUploadMsg, setViewUploadMsg] = useState('');
  const [viewSaving, setViewSaving] = useState(false);
  const [viewError, setViewError] = useState('');
  const [viewLoading, setViewLoading] = useState(false);
  const viewFileRef = useRef<HTMLInputElement>(null);

  const load = () => fetch(`/api/cashflow?month=${month}`).then((r) => r.json()).then(setData);
  useEffect(() => { load(); }, [month]);

  const openForm = () => { setForm(EMPTY_FORM); setReceiptPath(''); setPreview(null); setUploadMsg(''); setError(''); setShowForm(true); };

  const handleVoucher = async (file: File) => {
    setUploadMsg('Compressing…');
    let out = file;
    try {
      const c = await compressImage(file, { maxDim: 1600, targetBytes: 300 * 1024, mimeType: 'image/jpeg', quality: 0.65 });
      out = c.file;
      setUploadMsg(`Compressed → ${Math.round(out.size / 1024)}KB`);
    } catch { /* keep original */ }
    setPreview(URL.createObjectURL(out));
    const fd = new FormData();
    fd.append('file', out);
    const res = await fetch('/api/other-income/upload', { method: 'POST', body: fd });
    const d = await res.json();
    if (res.ok) setReceiptPath(d.path);
    else setUploadMsg(d.error || 'Upload failed');
  };

  const save = async () => {
    setError('');
    if (!form.amount || Number(form.amount) <= 0) { setError('Enter a valid amount'); return; }
    setSaving(true);
    const res = await fetch('/api/other-income', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, receipt_path: receiptPath }),
    });
    setSaving(false);
    if (!res.ok) { const d = await res.json(); setError(d.error || 'Failed'); return; }
    setShowForm(false);
    load();
  };

  const toggleVerify = async (e: LedgerEntry) => {
    const next = !e.verified;
    setData((d) => d ? { ...d, entries: d.entries.map((x) => (x.key === e.key ? { ...x, verified: next } : x)) } : d);
    if (e.kind === 'product' && e.orderId) {
      await fetch(`/api/orders/${e.orderId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { payment_verified: next } }) });
    } else if (e.incomeId) {
      await fetch(`/api/other-income/${e.incomeId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ verified: next }) });
    }
  };

  const handleBankImport = async (file: File) => {
    setImporting(true);
    setImportResult(null);
    setSelectedSuggestions(new Set());
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/cashflow/bank-import', { method: 'POST', body: fd });
    const d = await res.json();
    setImporting(false);
    if (!res.ok) { alert(d.error || 'Import failed'); return; }
    setImportResult(d);
    const suggestedIdx = d.results
      .map((r: BankImportResponse['results'][0], i: number) => (r.status === 'suggested' ? i : -1))
      .filter((i: number) => i >= 0);
    setSelectedSuggestions(new Set(suggestedIdx));
    load();
  };

  const confirmSuggestions = async () => {
    if (!importResult) return;
    const matches: ConfirmMatchPayload[] = [];
    importResult.results.forEach((r, i) => {
      if (r.status === 'suggested' && r.match && selectedSuggestions.has(i)) {
        matches.push({
          type: r.match.type,
          id: r.match.id,
          txn_date: r.row.txn_date,
          amount: r.row.deposit_amount,
          description: r.row.description,
        });
      }
    });
    if (matches.length === 0) { setImportResult(null); return; }
    setConfirming(true);
    const res = await fetch('/api/cashflow/bank-import/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matches }),
    });
    setConfirming(false);
    if (!res.ok) { const d = await res.json(); alert(d.error || 'Confirmation failed'); return; }
    setImportResult(null);
    load();
  };

  const toggleSuggestion = (idx: number) => {
    setSelectedSuggestions((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const openView = async (e: LedgerEntry) => {
    setViewEntry(e);
    setViewError('');
    setViewUploadMsg('');
    setViewReceiptPath('');
    setViewReceiptUrl(e.receiptUrl);
    setViewOrder(null);
    setViewIncome(null);
    setViewNotes('');
    setViewLoading(true);
    try {
      if (e.kind === 'product' && e.orderId) {
        const res = await fetch(`/api/orders/${e.orderId}`);
        const d = await res.json();
        if (!res.ok) { setViewError(d.error || 'Failed to load order'); return; }
        if (d.order) {
          setViewOrder(d.order);
          setViewNotes(d.order.notes || '');
          if (d.order.fields.payment_receipt_path) {
            setViewReceiptUrl(`/api/orders/${e.orderId}/payment-receipt?t=${Date.now()}`);
          }
        }
      } else if (e.incomeId) {
        const res = await fetch(`/api/other-income/${e.incomeId}`);
        const d = await res.json();
        if (!res.ok) { setViewError(d.error || 'Failed to load income'); return; }
        if (d.income) {
          setViewIncome(d.income);
          setViewNotes(String(d.income.remarks || ''));
          if (d.income.receipt_path) {
            setViewReceiptUrl(`/api/other-income/${e.incomeId}/receipt?t=${Date.now()}`);
          }
        }
      }
    } catch {
      setViewError('Failed to load details');
    } finally {
      setViewLoading(false);
    }
  };

  const handleViewReceiptUpload = async (rawFile: File) => {
    if (!viewEntry) return;
    setViewUploadMsg('Compressing…');
    setViewError('');
    let file = rawFile;
    try {
      if (rawFile.type === 'application/pdf') {
        const pages = await compressPdfToImages(rawFile, { quality: 0.65, maxWidthOrHeight: 1600 });
        if (pages[0]) file = pages[0];
      } else {
        const c = await compressImage(file, { maxDim: 1600, targetBytes: 300 * 1024, mimeType: 'image/jpeg', quality: 0.65 });
        file = c.file;
      }
    } catch { /* keep original */ }

    if (viewEntry.kind === 'product' && viewEntry.orderId) {
      const fd = new FormData();
      fd.append('receipt', file);
      const res = await fetch('/api/payments/scan', { method: 'POST', body: fd });
      const d = await res.json();
      if (!res.ok) { setViewError(d.error || 'Upload failed'); setViewUploadMsg(''); return; }
      const r = d.result || {};
      const fields: Record<string, string> = {};
      if (r.receipt_path) fields.payment_receipt_path = r.receipt_path;
      if (r.payment_date) fields.payment_date = r.payment_date;
      if (r.amount != null) fields.payment_amount = String(r.amount);
      if (r.bank) fields.payment_bank = r.bank;
      if (r.method) fields.payment_method_detail = r.method;
      if (r.reference) fields.payment_reference = r.reference;
      const patchRes = await fetch(`/api/orders/${viewEntry.orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
      });
      if (!patchRes.ok) { setViewError('Receipt uploaded but failed to attach to order'); setViewUploadMsg(''); return; }
      setViewReceiptUrl(`/api/orders/${viewEntry.orderId}/payment-receipt?t=${Date.now()}`);
      setViewReceiptPath(r.receipt_path || '');
      setViewUploadMsg('Payment receipt saved to order.');
      load();
    } else if (viewEntry.incomeId) {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/other-income/upload', { method: 'POST', body: fd });
      const d = await res.json();
      if (!res.ok) { setViewError(d.error || 'Upload failed'); setViewUploadMsg(''); return; }
      const patchRes = await fetch(`/api/other-income/${viewEntry.incomeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receipt_path: d.path }),
      });
      if (!patchRes.ok) { setViewError('Upload failed to save'); setViewUploadMsg(''); return; }
      setViewReceiptPath(d.path);
      setViewReceiptUrl(`/api/other-income/${viewEntry.incomeId}/receipt?t=${Date.now()}`);
      setViewUploadMsg('Voucher saved.');
      load();
    }
  };

  const saveView = async () => {
    if (!viewEntry) return;
    setViewSaving(true);
    setViewError('');
    try {
      if (viewEntry.kind === 'product' && viewEntry.orderId) {
        const fields: Record<string, string> = {};
        if (viewReceiptPath) fields.payment_receipt_path = viewReceiptPath;
        const res = await fetch(`/api/orders/${viewEntry.orderId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ core: { notes: viewNotes }, fields }),
        });
        if (!res.ok) { const d = await res.json(); setViewError(d.error || 'Save failed'); return; }
      } else if (viewEntry.incomeId) {
        const res = await fetch(`/api/other-income/${viewEntry.incomeId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            remarks: viewNotes,
            ...(viewReceiptPath ? { receipt_path: viewReceiptPath } : {}),
          }),
        });
        if (!res.ok) { const d = await res.json(); setViewError(d.error || 'Save failed'); return; }
      }
      setViewEntry(null);
      load();
    } catch {
      setViewError('Save failed');
    } finally {
      setViewSaving(false);
    }
  };

  const input = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none';
  const suggestedResults = importResult?.results.filter((r) => r.status === 'suggested') || [];

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cash Flow &amp; Reconciliation 營運收支中央看板</h1>
          <p className="text-gray-500 mt-1">All incoming revenue — product sales + other income — in one ledger</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none" />
          <button
            onClick={() => bankFileRef.current?.click()}
            disabled={importing}
            className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            {importing ? 'Importing…' : '🏦 Import Bank Statement (CSV/Excel)'}
          </button>
          <input
            ref={bankFileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0]) handleBankImport(e.target.files[0]);
              e.target.value = '';
            }}
          />
          <button onClick={openForm} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700">➕ Add Income 新增其他收入</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatCard title="Product Sales Revenue 產品銷售收入" value={formatMoney(data?.totals.productSales || 0)} icon="🛍️" color="bg-blue-50 text-blue-600" />
        <StatCard title="Other Income 其他收入" value={formatMoney(data?.totals.otherIncome || 0)} icon="💵" color="bg-green-50 text-green-600" />
        <StatCard title="Gross Revenue 總入帳金額" value={formatMoney(data?.totals.gross || 0)} icon="📈" color="bg-brand-50 text-brand-600" />
      </div>

      {data && data.unclaimed.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl mb-8 overflow-x-auto">
          <div className="px-6 py-4 border-b border-amber-200">
            <h2 className="font-semibold text-amber-900">Unclaimed Bank Deposits Pool 待認領入帳池</h2>
            <p className="text-xs text-amber-700 mt-1">Bank deposits with no matching order payment or other income in the system</p>
          </div>
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="text-left text-xs text-amber-800 uppercase tracking-wider border-b border-amber-200">
                <th className="px-4 py-3">Date 交易日期</th>
                <th className="px-4 py-3">Description 摘要備註</th>
                <th className="px-4 py-3 text-right">Deposit 入帳金額</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-amber-100">
              {data.unclaimed.map((u) => (
                <tr key={u.id} className="hover:bg-amber-100/50">
                  <td className="px-4 py-3 whitespace-nowrap text-amber-900">{u.txn_date}</td>
                  <td className="px-4 py-3 text-amber-800">{u.description || '—'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-amber-900">{formatMoney(u.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <div className="px-6 py-4 border-b border-gray-200"><h2 className="font-semibold text-gray-900">Unified Financial Ledger 統一流水帳</h2></div>
        {!data ? (
          <div className="p-12 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600 mx-auto" /></div>
        ) : data.entries.length === 0 ? (
          <div className="p-12 text-center text-gray-500">No income recorded yet. Add other income or record an order payment.</div>
        ) : (
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-200">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Source / Category</th>
                <th className="px-4 py-3">Order # / Description</th>
                <th className="px-4 py-3">Account</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Receipt</th>
                <th className="px-4 py-3">Bank</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.entries.map((e) => (
                <tr key={e.key} className="hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap text-gray-600">{e.date || '—'}</td>
                  <td className="px-4 py-3">
                    {e.kind === 'product' ? (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">Product Sale</span>
                    ) : (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Other Income · {e.category}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    <button onClick={() => openView(e)} className="text-left hover:text-brand-600">
                      {e.orderId ? <span className="font-mono">{e.ref || `#${e.orderId}`}</span> : (e.ref || '—')}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{e.account || '—'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatMoney(e.amount)}</td>
                  <td className="px-4 py-3">
                    {e.receiptUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={e.receiptUrl} alt="receipt" onClick={() => openView(e)} className="h-10 w-10 object-cover rounded border border-gray-200 cursor-pointer hover:ring-2 hover:ring-brand-400" />
                    ) : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {e.bankCleared ? (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">Bank Cleared</span>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {e.verified ? (
                      <button onClick={() => toggleVerify(e)} className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200">✓ Verified</button>
                    ) : (
                      <button onClick={() => toggleVerify(e)} className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 hover:bg-amber-200">Pending</button>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => openView(e)} className="text-sm text-brand-600 hover:text-brand-700 font-medium">View</button>
                    {e.orderId && (
                      <Link href={`/orders/${e.orderId}`} className="ml-3 text-sm text-gray-500 hover:text-gray-700">Order →</Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {viewEntry && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[55] p-4 overflow-y-auto" onClick={() => setViewEntry(null)}>
          <div className="bg-white rounded-xl w-full max-w-2xl my-8 p-6 shadow-xl max-h-[92vh] overflow-y-auto" onClick={(ev) => ev.stopPropagation()}>
            <div className="flex items-start justify-between mb-4 gap-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-gray-400">
                  {viewEntry.kind === 'product' ? 'Product Sale 產品銷售' : `Other Income · ${viewEntry.category}`}
                </p>
                <h2 className="text-xl font-bold text-gray-900">{viewEntry.ref || '—'}</h2>
                <p className="text-sm text-gray-500 mt-0.5">{viewEntry.date || '—'} · {formatMoney(viewEntry.amount)}</p>
              </div>
              <button onClick={() => setViewEntry(null)} className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200">Close</button>
            </div>

            {viewError && <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg">{viewError}</div>}
            {viewLoading ? (
              <div className="py-12 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600 mx-auto" /></div>
            ) : (
            <>
            <div className="grid grid-cols-2 gap-3 mb-5 text-sm">
              <div><span className="text-gray-400 text-xs block">Account 收款賬戶</span>{viewEntry.account || '—'}</div>
              <div><span className="text-gray-400 text-xs block">Verified</span>{viewEntry.verified ? '✓ Yes' : 'Pending'}</div>
              <div><span className="text-gray-400 text-xs block">Bank Cleared</span>{viewEntry.bankCleared ? '✓ Yes' : '—'}</div>
              {viewEntry.kind === 'product' && viewOrder && (
                <>
                  <div><span className="text-gray-400 text-xs block">Payment Date</span>{String(viewOrder.fields.payment_date || '—')}</div>
                  <div><span className="text-gray-400 text-xs block">Reference</span>{String(viewOrder.fields.payment_reference || '—')}</div>
                  <div><span className="text-gray-400 text-xs block">Bank / Platform</span>{String(viewOrder.fields.payment_bank || '—')}</div>
                  <div><span className="text-gray-400 text-xs block">Method</span>{String(viewOrder.fields.payment_method_detail || '—')}</div>
                </>
              )}
              {viewIncome && (
                <>
                  <div><span className="text-gray-400 text-xs block">Category</span>{String(viewIncome.category || '—')}</div>
                  <div><span className="text-gray-400 text-xs block">Date</span>{String(viewIncome.txn_date || '—')}</div>
                </>
              )}
            </div>

            <div className="mb-4">
              <p className="text-xs font-medium text-gray-600 mb-2">Receipt / Voucher 收據</p>
              {viewReceiptUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={viewReceiptUrl} alt="Receipt" onClick={() => setLightbox(viewReceiptUrl)} className="max-h-40 rounded-lg border border-gray-200 cursor-zoom-in hover:ring-2 hover:ring-brand-400 mb-3" />
              ) : (
                <p className="text-sm text-gray-400 mb-3">No receipt uploaded.</p>
              )}
              <div
                onClick={() => viewFileRef.current?.click()}
                onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files?.[0]) handleViewReceiptUpload(e.dataTransfer.files[0]); }}
                onDragOver={(e) => e.preventDefault()}
                className="border-2 border-dashed border-gray-300 rounded-xl p-4 text-center cursor-pointer hover:border-brand-400 hover:bg-brand-50/40"
              >
                <input ref={viewFileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleViewReceiptUpload(e.target.files[0]); e.target.value = ''; }} />
                <div className="text-xl mb-1">📎</div>
                <p className="text-xs text-gray-600">Upload payment receipt / voucher</p>
                {viewUploadMsg && <p className="text-[11px] text-brand-700 mt-1">{viewUploadMsg}</p>}
              </div>
            </div>

            <div className="mb-5">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {viewEntry.kind === 'product' ? 'Order Notes 訂單備註' : 'Remarks 備註'}
              </label>
              <textarea value={viewNotes} onChange={(e) => setViewNotes(e.target.value)} rows={3} className={input} placeholder="Add or update notes…" />
            </div>

            <button onClick={saveView} disabled={viewSaving || viewLoading} className="w-full py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 font-medium">
              {viewSaving ? 'Saving…' : 'Save Updates'}
            </button>
            </>
            )}
          </div>
        </div>
      )}

      {importResult && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl w-full max-w-2xl p-6 shadow-xl my-8 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-1">Bank Statement Import Results 月結單匯入結果</h2>
            <p className="text-sm text-gray-500 mb-4">
              {importResult.summary.total} rows processed · {importResult.summary.autoCleared} auto-cleared · {importResult.summary.suggested} suggested · {importResult.summary.unclaimed} unclaimed
            </p>

            {importResult.summary.autoCleared > 0 && (
              <div className="mb-4 p-3 bg-indigo-50 text-indigo-800 text-sm rounded-lg">
                ✓ {importResult.summary.autoCleared} deposit(s) matched by reference number and marked <strong>Bank Cleared</strong>.
              </div>
            )}

            {importResult.summary.unclaimed > 0 && (
              <div className="mb-4 p-3 bg-amber-50 text-amber-800 text-sm rounded-lg">
                {importResult.summary.unclaimed} unmatched deposit(s) added to the <strong>Unclaimed Bank Deposits Pool</strong>.
              </div>
            )}

            {suggestedResults.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Suggested Matches 建議比對（請確認）</h3>
                <p className="text-xs text-gray-500 mb-3">Amount matches exactly and date is within ±3 days of the recorded payment.</p>
                <div className="space-y-2">
                  {importResult.results.map((r, i) => {
                    if (r.status !== 'suggested' || !r.match) return null;
                    return (
                      <label key={i} className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedSuggestions.has(i)}
                          onChange={() => toggleSuggestion(i)}
                          className="mt-1"
                        />
                        <div className="flex-1 text-sm">
                          <div className="font-medium text-gray-900">
                            {formatMoney(r.row.deposit_amount)} on {r.row.txn_date}
                          </div>
                          <div className="text-gray-600 truncate">{r.row.description || '—'}</div>
                          <div className="text-xs text-brand-700 mt-1">
                            → {r.match.type === 'order' ? 'Order' : 'Other Income'}: {r.match.ref} ({formatMoney(r.match.amount)}, {r.match.date})
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              {suggestedResults.length > 0 ? (
                <button
                  onClick={confirmSuggestions}
                  disabled={confirming || selectedSuggestions.size === 0}
                  className="flex-1 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 font-medium"
                >
                  {confirming ? 'Confirming…' : `Confirm ${selectedSuggestions.size} Match(es) as Bank Cleared`}
                </button>
              ) : (
                <button onClick={() => setImportResult(null)} className="flex-1 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 font-medium">Done</button>
              )}
              <button onClick={() => setImportResult(null)} className="flex-1 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium">Close</button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl w-full max-w-lg p-6 shadow-xl my-8">
            <h2 className="text-lg font-semibold mb-4">Add Other Income 新增其他收入</h2>
            {error && <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg">{error}</div>}
            <div className="space-y-3">
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Income Category 收入類別</label>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={input}>{INCOME_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Transaction Date 入帳日期</label><input type="date" value={form.txn_date} onChange={(e) => setForm({ ...form, txn_date: e.target.value })} className={input} /></div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Amount ($) 金額</label><input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={input} placeholder="0.00" /></div>
              </div>
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Received Account 收款賬戶</label>
                <select value={form.account} onChange={(e) => setForm({ ...form, account: e.target.value })} className={input}>{RECEIVED_ACCOUNTS.map((a) => <option key={a} value={a}>{a}</option>)}</select></div>
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Remarks 備註</label><input value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} className={input} placeholder="e.g. 7月份物業租金收入" /></div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Voucher 收據/憑證</label>
                <div onClick={() => fileRef.current?.click()} onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files?.[0]) handleVoucher(e.dataTransfer.files[0]); }} onDragOver={(e) => e.preventDefault()}
                  className="border-2 border-dashed border-gray-300 rounded-xl p-4 text-center cursor-pointer hover:border-brand-400 hover:bg-brand-50/40">
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleVoucher(e.target.files[0]); e.target.value = ''; }} />
                  {preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={preview} alt="voucher" className="max-h-28 mx-auto rounded" />
                  ) : (<><div className="text-2xl mb-1">📎</div><p className="text-xs text-gray-500">Drag/drop or click (auto-compressed 1600px · 0.65 · &lt;300KB)</p></>)}
                  {uploadMsg && <p className="text-[11px] text-brand-700 mt-2">{uploadMsg}</p>}
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={save} disabled={saving} className="flex-1 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 font-medium">{saving ? 'Saving…' : 'Add Income'}</button>
                <button onClick={() => setShowForm(false)} className="flex-1 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {lightbox && (
        <div onClick={() => setLightbox(null)} className="fixed inset-0 bg-black/80 flex items-center justify-center z-[70] p-4 cursor-zoom-out">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="Receipt" className="max-h-[92vh] max-w-[92vw] object-contain rounded-lg shadow-2xl bg-white" />
        </div>
      )}
    </AppLayout>
  );
}
