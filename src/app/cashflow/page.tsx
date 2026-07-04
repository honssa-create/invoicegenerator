'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import { StatCard } from '@/components/ui';
import { compressImage } from '@/lib/imageCompression';
import type { BankImportResponse, ConfirmMatchPayload } from '@/lib/bank-statement';
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
                    {e.orderId ? <Link href={`/orders/${e.orderId}`} className="text-brand-600 hover:text-brand-700 font-mono">{e.ref || `#${e.orderId}`}</Link> : (e.ref || '—')}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{e.account || '—'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatMoney(e.amount)}</td>
                  <td className="px-4 py-3">
                    {e.receiptUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={e.receiptUrl} alt="receipt" onClick={() => setLightbox(e.receiptUrl)} className="h-10 w-10 object-cover rounded border border-gray-200 cursor-zoom-in hover:ring-2 hover:ring-brand-400" />
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
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

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
