'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import { StatCard } from '@/components/ui';
import { formatMoney } from '@/lib/cashflow';
import {
  PAYMENT_METHOD_LABELS,
  RECON_STATUS_COLORS,
  type PaymentMethod,
  type ReconciliationRecord,
} from '@/lib/reconciliation';

interface MatchCandidate {
  order_id: number;
  order_no: string;
  invoice_id: number | null;
  invoice_number: string | null;
  invoice_total: number | null;
  invoice_status: string | null;
  customer_name: string | null;
  phone: string | null;
}

interface Summary {
  total: number;
  matched: number;
  unmatched: number;
  discrepancy: number;
  pendingApproval: number;
  pendingHigh: number;
  pendingMedium: number;
  grossTotal: number;
  netTotal: number;
  feeTotal: number;
}

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
  const [busyId, setBusyId] = useState<number | null>(null);
  const [batchApproving, setBatchApproving] = useState(false);
  const [linkRecordId, setLinkRecordId] = useState<number | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
  const [candidateSearch, setCandidateSearch] = useState('');
  const [linking, setLinking] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = (q?: string) => {
    setLoading(true);
    const qs = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : '';
    fetch(`/api/reconciliation${qs}`)
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

  const high = useMemo(
    () => records.filter((r) => r.status === 'Pending Approval' && r.confidence === 'high'),
    [records]
  );
  const medium = useMemo(
    () => records.filter((r) => r.status === 'Pending Approval' && r.confidence === 'medium'),
    [records]
  );
  const needsAttention = useMemo(
    () => records.filter((r) => r.status === 'Unmatched' || r.status === 'Discrepancy'),
    [records]
  );
  const matched = useMemo(() => records.filter((r) => r.status === 'Matched'), [records]);

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
    setMessage(
      `Yedpay sync: fetched ${d.fetched}, imported ${d.imported}, suggested ${d.suggested}, skipped ${d.skipped}`
    );
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
      `Bank statement (${uploadMethod}): imported ${d.imported}, suggested ${d.suggested}, skipped ${d.skipped}${
        d.errors?.length ? `, ${d.errors.length} row warnings` : ''
      }`
    );
    load();
  };

  const approveOne = async (id: number, invoiceId?: number) => {
    setBusyId(id);
    setError('');
    const res = await fetch(`/api/reconciliation/${id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invoiceId ? { invoice_id: invoiceId } : {}),
    });
    const d = await res.json();
    setBusyId(null);
    if (!res.ok) {
      setError(d.error || 'Approve failed');
      return false;
    }
    return true;
  };

  const rejectOne = async (id: number) => {
    setBusyId(id);
    setError('');
    const res = await fetch(`/api/reconciliation/${id}/reject`, { method: 'POST' });
    const d = await res.json();
    setBusyId(null);
    if (!res.ok) {
      setError(d.error || 'Reject failed');
      return;
    }
    setMessage(`Record #${id} rejected — back to Unmatched`);
    load();
  };

  const approveAllHigh = async () => {
    setBatchApproving(true);
    setError('');
    setMessage('');
    const res = await fetch('/api/reconciliation/approve-batch', { method: 'POST' });
    const d = await res.json();
    setBatchApproving(false);
    if (!res.ok) {
      setError(d.error || 'Batch approve failed');
      return;
    }
    setMessage(`Approved ${d.approved} high-confidence record(s)`);
    load();
  };

  const openLink = (id: number) => {
    setLinkRecordId(id);
    setSelectedInvoiceId('');
    setCandidateSearch('');
    load();
  };

  const submitManualLink = async () => {
    if (!linkRecordId || !selectedInvoiceId) return;
    setLinking(true);
    setError('');
    const res = await fetch(`/api/reconciliation/${linkRecordId}/match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoice_id: Number(selectedInvoiceId) }),
    });
    const d = await res.json();
    setLinking(false);
    if (!res.ok) {
      setError(d.error || 'Manual link failed');
      return;
    }
    setLinkRecordId(null);
    setSelectedInvoiceId('');
    setMessage(`Record #${linkRecordId} linked & approved → ${d.record?.invoice_number || 'invoice'}`);
    load();
  };

  const filteredCandidates = useMemo(() => {
    const q = candidateSearch.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) =>
      [c.order_no, c.invoice_number, c.customer_name, c.phone]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [candidates, candidateSearch]);

  const selectCls =
    'w-full px-3 py-2.5 sm:py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none';

  const bankCell = (r: ReconciliationRecord) => (
    <div className="space-y-0.5">
      <div className="font-medium text-gray-900">{formatMoney(r.gross_amount)}</div>
      <div className="text-xs text-gray-500">
        {PAYMENT_METHOD_LABELS[r.payment_method]} · {r.deposit_time}
      </div>
      {r.remarks && (
        <div className="text-xs text-gray-400 truncate max-w-[240px]" title={r.remarks}>
          {r.remarks}
        </div>
      )}
    </div>
  );

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">Reconciliation 對帳審核</h1>
          <p className="text-gray-500 mt-1 text-sm sm:text-base">
            Suggest matches from Yedpay / bank statements — approve before marking invoices paid
          </p>
        </div>
        <div className="page-actions flex flex-col sm:flex-row gap-2">
          <button
            onClick={syncYedpay}
            disabled={syncing || !yedpayConfigured}
            className="btn bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
            title={yedpayConfigured ? undefined : 'Add Yedpay credentials in Settings → API Integrations'}
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

      {message && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {message}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Pending High 高信心"
          value={String(summary?.pendingHigh ?? 0)}
          icon="🎯"
          color="bg-blue-50 text-blue-700"
        />
        <StatCard
          title="Pending Medium 中信心"
          value={String(summary?.pendingMedium ?? 0)}
          icon="🔍"
          color="bg-indigo-50 text-indigo-700"
        />
        <StatCard
          title="Needs Attention 待處理"
          value={String((summary?.unmatched ?? 0) + (summary?.discrepancy ?? 0))}
          icon="⚠️"
          color="bg-amber-50 text-amber-700"
        />
        <StatCard
          title="Matched 已對帳"
          value={String(summary?.matched ?? 0)}
          icon="✅"
          color="bg-green-50 text-green-700"
        />
      </div>

      {loading ? (
        <div className="p-12 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600 mx-auto" />
        </div>
      ) : (
        <div className="space-y-8">
          {/* Zone A — High confidence */}
          <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 bg-blue-50/40">
              <div>
                <h2 className="font-semibold text-gray-900">A. High Confidence 高信心建議</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Order no. + amount exact match — review then batch approve
                </p>
              </div>
              <button
                onClick={approveAllHigh}
                disabled={batchApproving || high.length === 0}
                className="btn bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 whitespace-nowrap"
              >
                {batchApproving ? 'Approving…' : `Approve All High-Confidence (${high.length})`}
              </button>
            </div>
            {high.length === 0 ? (
              <div className="p-6 text-sm text-gray-500">No high-confidence items pending.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-100">
                      <th className="px-4 py-2">Bank deposit</th>
                      <th className="px-4 py-2">Suggested order</th>
                      <th className="px-4 py-2">Invoice</th>
                      <th className="px-4 py-2">Amount</th>
                      <th className="px-4 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {high.map((r) => (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">{bankCell(r)}</td>
                        <td className="px-4 py-3">
                          {r.suggested_order_id ? (
                            <Link
                              href={`/orders/${r.suggested_order_id}`}
                              className="font-mono text-brand-600 hover:text-brand-700"
                            >
                              {r.suggested_order_no || r.order_no || `#${r.suggested_order_id}`}
                            </Link>
                          ) : (
                            <span className="font-mono">{r.order_no || '—'}</span>
                          )}
                          {r.suggested_customer_name && (
                            <div className="text-xs text-gray-500">{r.suggested_customer_name}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {r.suggested_invoice_id ? (
                            <Link href={`/invoices/${r.suggested_invoice_id}`} className="text-brand-600">
                              {r.suggested_invoice_number}
                            </Link>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {r.suggested_amount != null ? formatMoney(r.suggested_amount) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            disabled={busyId === r.id}
                            onClick={async () => {
                              if (await approveOne(r.id)) {
                                setMessage(`Approved #${r.id}`);
                                load();
                              }
                            }}
                            className="text-xs px-2.5 py-1 rounded-full bg-green-100 text-green-800 hover:bg-green-200 disabled:opacity-50"
                          >
                            {busyId === r.id ? '…' : 'Approve'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Zone B — Medium confidence */}
          <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-indigo-50/40">
              <h2 className="font-semibold text-gray-900">B. Medium Confidence 中信心建議</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Amount + method + ±48h of order created — approve, reject, or relink
              </p>
            </div>
            {medium.length === 0 ? (
              <div className="p-6 text-sm text-gray-500">No medium-confidence items pending.</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {medium.map((r) => (
                  <div key={r.id} className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4">
                    <div className="rounded-lg border border-gray-200 p-3 bg-gray-50">
                      <div className="text-xs font-medium text-gray-500 mb-1">Bank record</div>
                      {bankCell(r)}
                      <div className="text-xs text-gray-400 mt-1">Fee {formatMoney(r.transaction_fee)} · Net {formatMoney(r.net_amount)}</div>
                    </div>
                    <div className="rounded-lg border border-indigo-200 p-3 bg-indigo-50/50">
                      <div className="text-xs font-medium text-indigo-700 mb-1">Suggested order</div>
                      {r.suggested_order_id ? (
                        <>
                          <Link
                            href={`/orders/${r.suggested_order_id}`}
                            className="font-mono font-medium text-brand-700 hover:text-brand-800"
                          >
                            {r.suggested_order_no || r.order_no || `#${r.suggested_order_id}`}
                          </Link>
                          <div className="text-sm text-gray-700 mt-0.5">
                            {r.suggested_customer_name || '—'}
                            {r.suggested_amount != null ? ` · ${formatMoney(r.suggested_amount)}` : ''}
                          </div>
                          {r.suggested_invoice_id && (
                            <Link
                              href={`/invoices/${r.suggested_invoice_id}`}
                              className="text-xs text-brand-600 mt-1 inline-block"
                            >
                              {r.suggested_invoice_number}
                            </Link>
                          )}
                        </>
                      ) : (
                        <span className="text-gray-500">—</span>
                      )}
                      <div className="flex flex-wrap gap-2 mt-3">
                        <button
                          disabled={busyId === r.id}
                          onClick={async () => {
                            if (await approveOne(r.id)) {
                              setMessage(`Approved #${r.id}`);
                              load();
                            }
                          }}
                          className="text-xs px-2.5 py-1 rounded-full bg-green-100 text-green-800 hover:bg-green-200 disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          disabled={busyId === r.id}
                          onClick={() => rejectOne(r.id)}
                          className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                        >
                          Reject
                        </button>
                        <button
                          onClick={() => openLink(r.id)}
                          className="text-xs px-2.5 py-1 rounded-full bg-brand-50 text-brand-700 hover:bg-brand-100"
                        >
                          Relink
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Zone C — Needs attention */}
          <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-amber-50/40">
              <h2 className="font-semibold text-gray-900">C. Needs Attention 無法配對 / 異常</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Unmatched deposits and amount collisions — search and manually link
              </p>
            </div>
            {needsAttention.length === 0 ? (
              <div className="p-6 text-sm text-gray-500">Nothing needs attention.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1000px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-100">
                      <th className="px-4 py-2">Bank deposit</th>
                      <th className="px-4 py-2">Status</th>
                      <th className="px-4 py-2">Candidates / suggestion</th>
                      <th className="px-4 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {needsAttention.map((r) => (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">{bankCell(r)}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${RECON_STATUS_COLORS[r.status]}`}
                          >
                            {r.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {r.candidates.length > 0 ? (
                            <div className="space-y-0.5">
                              {r.candidates.map((c) => (
                                <div key={c.order_id} className="font-mono text-xs">
                                  {c.order_id ? (
                                    <Link href={`/orders/${c.order_id}`} className="text-brand-600">
                                      {c.order_no}
                                    </Link>
                                  ) : (
                                    c.order_no
                                  )}
                                  {c.amount != null ? ` · ${formatMoney(c.amount)}` : ''}
                                  {c.customer_name ? ` · ${c.customer_name}` : ''}
                                </div>
                              ))}
                            </div>
                          ) : r.suggested_order_id ? (
                            <div>
                              <Link href={`/orders/${r.suggested_order_id}`} className="font-mono text-brand-600">
                                {r.suggested_order_no || r.order_no}
                              </Link>
                              {r.suggested_amount != null && (
                                <span className="text-xs text-gray-500">
                                  {' '}
                                  (expected {formatMoney(r.suggested_amount)})
                                </span>
                              )}
                            </div>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            {r.suggested_invoice_id && (
                              <button
                                disabled={busyId === r.id}
                                onClick={async () => {
                                  if (await approveOne(r.id)) {
                                    setMessage(`Approved #${r.id}`);
                                    load();
                                  }
                                }}
                                className="text-xs px-2.5 py-1 rounded-full bg-green-100 text-green-800 hover:bg-green-200 disabled:opacity-50"
                              >
                                Approve suggestion
                              </button>
                            )}
                            <button
                              onClick={() => openLink(r.id)}
                              className="text-xs px-2.5 py-1 rounded-full bg-brand-50 text-brand-700 hover:bg-brand-100"
                            >
                              Manual Link
                            </button>
                            {r.status === 'Discrepancy' && (
                              <button
                                disabled={busyId === r.id}
                                onClick={() => rejectOne(r.id)}
                                className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                              >
                                Clear
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Already matched audit list */}
          <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Already Matched 已核准</h2>
              <p className="text-xs text-gray-500 mt-0.5">Audit trail with approver</p>
            </div>
            {matched.length === 0 ? (
              <div className="p-6 text-sm text-gray-500">No matched records yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-100">
                      <th className="px-4 py-2">Order</th>
                      <th className="px-4 py-2">Deposit</th>
                      <th className="px-4 py-2">Gross / Net</th>
                      <th className="px-4 py-2">Invoice</th>
                      <th className="px-4 py-2">Approved by</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {matched.slice(0, 50).map((r) => (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-mono">
                          {r.order_id ? (
                            <Link href={`/orders/${r.order_id}`} className="text-brand-600">
                              {r.order_no || `#${r.order_id}`}
                            </Link>
                          ) : (
                            r.order_no || '—'
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.deposit_time}</td>
                        <td className="px-4 py-3">
                          {formatMoney(r.gross_amount)}
                          <span className="text-xs text-gray-400"> / {formatMoney(r.net_amount)}</span>
                        </td>
                        <td className="px-4 py-3">
                          {r.invoice_id ? (
                            <Link href={`/invoices/${r.invoice_id}`} className="text-brand-600">
                              {r.invoice_number}
                            </Link>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {r.approved_by || '—'}
                          {r.approved_at ? (
                            <div className="text-xs text-gray-400">{r.approved_at.slice(0, 16)}</div>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {linkRecordId !== null && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Manual Link 手動連結訂單</h2>
            <p className="text-sm text-gray-500 mb-4">
              Link record #{linkRecordId} to an unpaid invoice (approves immediately).
            </p>
            <label className="text-xs font-medium text-gray-500">Search name / phone / order / invoice</label>
            <input
              value={candidateSearch}
              onChange={(e) => setCandidateSearch(e.target.value)}
              placeholder="e.g. 張先生 / 9123 / NES-…"
              className={`${selectCls} mt-1 mb-3`}
            />
            <label className="text-xs font-medium text-gray-500">Invoice</label>
            <select
              value={selectedInvoiceId}
              onChange={(e) => setSelectedInvoiceId(e.target.value)}
              className={`${selectCls} mt-1 mb-4`}
            >
              <option value="">Select invoice…</option>
              {filteredCandidates.map((c) => (
                <option key={c.invoice_id!} value={c.invoice_id!}>
                  {c.invoice_number}
                  {c.order_no ? ` · ${c.order_no}` : ''}
                  {c.invoice_total != null ? ` · ${formatMoney(c.invoice_total)}` : ''}
                  {c.customer_name ? ` · ${c.customer_name}` : ''}
                  {c.phone ? ` · ${c.phone}` : ''}
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setLinkRecordId(null);
                  setSelectedInvoiceId('');
                }}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={submitManualLink}
                disabled={!selectedInvoiceId || linking}
                className="px-4 py-2 text-sm rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {linking ? 'Saving…' : 'Manual Link & Approve'}
              </button>
            </div>
          </div>
        </div>
      )}

    </AppLayout>
  );
}
