'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import FilterBar from '@/components/FilterBar';
import { StatCard } from '@/components/ui';
import { formatMoney } from '@/lib/cashflow';
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  RECON_STATUS_COLORS,
  type PaymentMethod,
  type ReconciliationRecord,
  type ReconciliationStatus,
} from '@/lib/reconciliation';

interface MatchCandidate {
  order_id: number;
  order_no: string;
  invoice_id: number | null;
  invoice_number: string | null;
  invoice_total: number | null;
  invoice_status: string | null;
  customer_name: string | null;
}

interface Summary {
  total: number;
  matched: number;
  unmatched: number;
  discrepancy: number;
  grossTotal: number;
  netTotal: number;
  feeTotal: number;
}

const STATUS_OPTIONS: Array<ReconciliationStatus | 'all'> = ['all', 'Unmatched', 'Matched', 'Discrepancy'];

export default function ReconciliationPage() {
  const [records, setRecords] = useState<ReconciliationRecord[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [candidates, setCandidates] = useState<MatchCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [yedpayConfigured, setYedpayConfigured] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMethod, setUploadMethod] = useState<PaymentMethod>('FPS');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ReconciliationStatus | 'all'>('all');
  const [methodFilter, setMethodFilter] = useState<PaymentMethod | 'all'>('all');
  const [matchRecordId, setMatchRecordId] = useState<number | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
  const [matching, setMatching] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => {
    setLoading(true);
    fetch('/api/reconciliation')
      .then((r) => r.json())
      .then((d) => {
        setRecords(d.records || []);
        setSummary(d.summary || null);
        setCandidates(d.candidates || []);
        setYedpayConfigured(Boolean(d.yedpayConfigured));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    let rows = [...records];
    if (statusFilter !== 'all') rows = rows.filter((r) => r.status === statusFilter);
    if (methodFilter !== 'all') rows = rows.filter((r) => r.payment_method === methodFilter);
    if (dateStart) rows = rows.filter((r) => r.deposit_time.slice(0, 10) >= dateStart);
    if (dateEnd) rows = rows.filter((r) => r.deposit_time.slice(0, 10) <= dateEnd);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((r) =>
        [r.order_no, r.invoice_number, r.remarks, r.payment_method, r.status]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q)
      );
    }
    return rows;
  }, [records, statusFilter, methodFilter, dateStart, dateEnd, search]);

  const syncYedpay = async () => {
    setSyncing(true);
    setError('');
    setMessage('');
    const res = await fetch('/api/reconciliation/sync-yedpay', { method: 'POST' });
    const d = await res.json();
    setSyncing(false);
    if (!res.ok) {
      setError(d.error || 'Sync failed');
      return;
    }
    setMessage(`Yedpay sync: fetched ${d.fetched}, imported ${d.imported}, matched ${d.matched}, skipped ${d.skipped}`);
    load();
  };

  const uploadStatement = async (file: File) => {
    setUploading(true);
    setError('');
    setMessage('');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('payment_method', uploadMethod);
    const res = await fetch('/api/reconciliation/upload', { method: 'POST', body: fd });
    const d = await res.json();
    setUploading(false);
    if (!res.ok) {
      setError(d.error || 'Upload failed');
      return;
    }
    setMessage(
      `Bank statement (${uploadMethod}): imported ${d.imported}, matched ${d.matched}, skipped ${d.skipped}${
        d.errors?.length ? `, ${d.errors.length} row warnings` : ''
      }`
    );
    load();
  };

  const submitManualMatch = async () => {
    if (!matchRecordId || !selectedInvoiceId) return;
    setMatching(true);
    setError('');
    const res = await fetch(`/api/reconciliation/${matchRecordId}/match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoice_id: Number(selectedInvoiceId) }),
    });
    const d = await res.json();
    setMatching(false);
    if (!res.ok) {
      setError(d.error || 'Match failed');
      return;
    }
    setMatchRecordId(null);
    setSelectedInvoiceId('');
    setMessage(`Record #${matchRecordId} matched to ${d.record?.invoice_number || 'invoice'}`);
    load();
  };

  const selectCls =
    'w-full px-3 py-2.5 sm:py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none';

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">Reconciliation 對帳</h1>
          <p className="text-gray-500 mt-1 text-sm sm:text-base">
            Yedpay auto-sync + FPS/PayMe bank statement matching against invoices
          </p>
        </div>
        <div className="page-actions flex flex-col sm:flex-row gap-2">
          <button
            onClick={syncYedpay}
            disabled={syncing || !yedpayConfigured}
            className="btn bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
            title={yedpayConfigured ? undefined : 'Set YEDPAY_ACCESS_TOKEN and YEDPAY_USER_ID'}
          >
            {syncing ? 'Syncing…' : 'Sync Yedpay Transactions'}
          </button>
          <div className="flex gap-2">
            <select
              value={uploadMethod}
              onChange={(e) => setUploadMethod(e.target.value as PaymentMethod)}
              className={selectCls}
            >
              <option value="FPS">FPS</option>
              <option value="Payme">PayMe</option>
            </select>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="btn border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 whitespace-nowrap"
            >
              {uploading ? 'Uploading…' : 'Upload Bank Statement'}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadStatement(f);
                e.target.value = '';
              }}
            />
          </div>
        </div>
      </div>

      {message && <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{message}</div>}
      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="Total Records 總筆數" value={String(summary?.total ?? 0)} icon="📋" color="bg-gray-50 text-gray-700" />
        <StatCard title="Matched 已對帳" value={String(summary?.matched ?? 0)} icon="✅" color="bg-green-50 text-green-700" />
        <StatCard title="Unmatched 待對帳" value={String(summary?.unmatched ?? 0)} icon="⏳" color="bg-amber-50 text-amber-700" />
        <StatCard title="Net Deposits 實際入帳" value={formatMoney(summary?.netTotal ?? 0)} icon="💰" color="bg-brand-50 text-brand-700" />
      </div>

      <FilterBar
        dateStart={dateStart}
        dateEnd={dateEnd}
        onDateStart={setDateStart}
        onDateEnd={setDateEnd}
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Order #, invoice, remarks…"
        onClear={() => {
          setDateStart('');
          setDateEnd('');
          setSearch('');
          setStatusFilter('all');
          setMethodFilter('all');
        }}
      >
        <div className="flex flex-col min-w-[140px]">
          <label className="text-[11px] font-medium text-gray-500 mb-1">Status 狀態</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as ReconciliationStatus | 'all')} className={selectCls}>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s === 'all' ? 'All' : s}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col min-w-[140px]">
          <label className="text-[11px] font-medium text-gray-500 mb-1">Payment 付款方式</label>
          <select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value as PaymentMethod | 'all')} className={selectCls}>
            <option value="all">All</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHOD_LABELS[m]}
              </option>
            ))}
          </select>
        </div>
      </FilterBar>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        {loading ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600 mx-auto" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            No reconciliation records yet. Sync Yedpay or upload an FPS/PayMe bank statement to get started.
          </div>
        ) : (
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-200">
                <th className="px-4 py-3">Order No.</th>
                <th className="px-4 py-3">Deposit Time 入帳時間</th>
                <th className="px-4 py-3">Gross 銀碼</th>
                <th className="px-4 py-3">Fee 手續費</th>
                <th className="px-4 py-3">Net 實際入帳</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Invoice</th>
                <th className="px-4 py-3">Remarks</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-gray-800">{r.order_no || '—'}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.deposit_time}</td>
                  <td className="px-4 py-3 font-medium">{formatMoney(r.gross_amount)}</td>
                  <td className="px-4 py-3 text-gray-600">{formatMoney(r.transaction_fee)}</td>
                  <td className="px-4 py-3 font-medium text-brand-700">{formatMoney(r.net_amount)}</td>
                  <td className="px-4 py-3">{PAYMENT_METHOD_LABELS[r.payment_method]}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${RECON_STATUS_COLORS[r.status]}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {r.invoice_id ? (
                      <Link href={`/invoices/${r.invoice_id}`} className="text-brand-600 hover:text-brand-700 font-medium">
                        {r.invoice_number}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 max-w-[220px] truncate" title={r.remarks || ''}>
                    {r.remarks || '—'}
                  </td>
                  <td className="px-4 py-3">
                    {r.status === 'Unmatched' ? (
                      <button
                        onClick={() => {
                          setMatchRecordId(r.id);
                          setSelectedInvoiceId('');
                        }}
                        className="text-xs px-2.5 py-1 rounded-full bg-brand-50 text-brand-700 hover:bg-brand-100"
                      >
                        Match 手動對帳
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400">{r.matched_at ? `Matched ${r.matched_at.slice(0, 10)}` : '—'}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {matchRecordId !== null && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Manual Reconciliation 手動對帳</h2>
            <p className="text-sm text-gray-500 mb-4">Link record #{matchRecordId} to an unpaid invoice.</p>
            <label className="text-xs font-medium text-gray-500">Invoice</label>
            <select value={selectedInvoiceId} onChange={(e) => setSelectedInvoiceId(e.target.value)} className={`${selectCls} mt-1 mb-4`}>
              <option value="">Select invoice…</option>
              {candidates.map((c) => (
                <option key={c.invoice_id!} value={c.invoice_id!}>
                  {c.invoice_number}
                  {c.order_no ? ` · ${c.order_no}` : ''}
                  {c.invoice_total != null ? ` · ${formatMoney(c.invoice_total)}` : ''}
                  {c.customer_name ? ` · ${c.customer_name}` : ''}
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setMatchRecordId(null);
                  setSelectedInvoiceId('');
                }}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={submitManualMatch}
                disabled={!selectedInvoiceId || matching}
                className="px-4 py-2 text-sm rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {matching ? 'Saving…' : 'Confirm Match'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
