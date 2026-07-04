'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import { StatCard, PaymentStatusBadge, formatCurrency } from '@/components/ui';
import { formatDate } from '@/lib/utils';
import { useAuth } from '@/components/AuthProvider';
import type { PaymentWithDetails, UnclaimedDepositWithDetails, InvoiceWithDetails } from '@/lib/types';

interface ReconciliationData {
  unclaimedDeposits: UnclaimedDepositWithDetails[];
  unclaimedTotal: number;
  pendingPayments: PaymentWithDetails[];
  pendingTotal: number;
  bankClearedPayments: PaymentWithDetails[];
  bankClearedTotal: number;
  pendingVerificationCount: number;
}

interface ImportSummary {
  totalRows: number;
  exactMatches: number;
  suggestedMatches: number;
  unclaimedCreated: number;
  skipped: number;
}

interface ImportResult {
  summary: ImportSummary;
  exactMatches: {
    rowIndex: number;
    date: string;
    amount: number;
    description: string;
    paymentId: number;
    invoiceNumber: string;
    customerName: string;
    matchType: string;
  }[];
  suggestedMatches: {
    rowIndex: number;
    date: string;
    amount: number;
    description: string;
    paymentId: number;
    invoiceNumber: string;
    customerName: string;
    paymentDate: string;
    daysDiff: number;
    matchType: string;
  }[];
  unclaimedCreated: {
    rowIndex: number;
    date: string;
    amount: number;
    description: string;
    depositId: number;
  }[];
}

export default function ReconciliationPage() {
  const { user } = useAuth();
  const [data, setData] = useState<ReconciliationData | null>(null);
  const [showLogModal, setShowLogModal] = useState(false);
  const [claimingId, setClaimingId] = useState<number | null>(null);
  const [linkableInvoices, setLinkableInvoices] = useState<InvoiceWithDetails[]>([]);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
  const [verifyingId, setVerifyingId] = useState<number | null>(null);
  const [depositForm, setDepositForm] = useState({
    deposit_date: new Date().toISOString().slice(0, 10),
    amount: '',
    bank: '',
    remarks: '',
  });
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState('');
  const [selectedSuggested, setSelectedSuggested] = useState<Set<number>>(new Set());
  const [confirming, setConfirming] = useState(false);

  const isAccountant = user?.role === 'accountant';

  const loadData = useCallback(() => {
    fetch('/api/reconciliation')
      .then((res) => res.json())
      .then(setData);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleLogDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const res = await fetch('/api/unclaimed-deposits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(depositForm),
    });
    setSaving(false);
    if (res.ok) {
      setShowLogModal(false);
      setDepositForm({
        deposit_date: new Date().toISOString().slice(0, 10),
        amount: '',
        bank: '',
        remarks: '',
      });
      loadData();
    }
  };

  const openClaimModal = async (depositId: number) => {
    setClaimingId(depositId);
    setSelectedInvoiceId('');
    const res = await fetch('/api/invoices?linkable=1');
    const json = await res.json();
    setLinkableInvoices(json.invoices || []);
  };

  const handleClaim = async () => {
    if (!claimingId || !selectedInvoiceId) return;
    setSaving(true);
    const res = await fetch(`/api/unclaimed-deposits/${claimingId}/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoice_id: Number(selectedInvoiceId) }),
    });
    setSaving(false);
    if (res.ok) {
      setClaimingId(null);
      loadData();
    }
  };

  const handleVerify = async (paymentId: number) => {
    setVerifyingId(paymentId);
    const res = await fetch(`/api/payments/${paymentId}/verify`, { method: 'POST' });
    setVerifyingId(null);
    if (res.ok) loadData();
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportError('');
    setImportResult(null);
    setSelectedSuggested(new Set());

    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch('/api/bank-statement/import', {
      method: 'POST',
      body: formData,
    });
    const json = await res.json();
    setImporting(false);
    e.target.value = '';

    if (!res.ok) {
      setImportError(json.error || 'Import failed');
      return;
    }

    setImportResult(json);
    loadData();
  };

  const toggleSuggested = (paymentId: number) => {
    setSelectedSuggested((prev) => {
      const next = new Set(prev);
      if (next.has(paymentId)) next.delete(paymentId);
      else next.add(paymentId);
      return next;
    });
  };

  const handleConfirmSuggested = async () => {
    if (selectedSuggested.size === 0) return;
    setConfirming(true);
    const res = await fetch('/api/bank-statement/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payment_ids: Array.from(selectedSuggested) }),
    });
    setConfirming(false);
    if (res.ok) {
      setImportResult((prev) =>
        prev
          ? {
              ...prev,
              suggestedMatches: prev.suggestedMatches.filter(
                (m) => !selectedSuggested.has(m.paymentId)
              ),
              summary: {
                ...prev.summary,
                suggestedMatches:
                  prev.summary.suggestedMatches - selectedSuggested.size,
              },
            }
          : null
      );
      setSelectedSuggested(new Set());
      loadData();
    }
  };

  if (!data) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cash Flow &amp; Reconciliation</h1>
          <p className="text-gray-500 mt-1">
            雙重核對機制 — Bridge receipt uploads with verified bank deposits
          </p>
        </div>
        {isAccountant && (
          <div className="flex items-center gap-3">
            <label className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors cursor-pointer">
              {importing ? 'Importing...' : 'Import Bank Statement (CSV/Excel)'}
              <input
                type="file"
                accept=".csv,.xlsx,.xls,.txt"
                onChange={handleImportFile}
                disabled={importing}
                className="hidden"
              />
            </label>
          </div>
        )}
      </div>

      {importError && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          {importError}
        </div>
      )}

      {importResult && (
        <div className="mb-8 bg-indigo-50 border-2 border-indigo-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 bg-indigo-100 border-b border-indigo-200">
            <h2 className="font-bold text-indigo-900 text-lg">Bank Statement Import Results</h2>
            <p className="text-sm text-indigo-700 mt-1">月結單匯入 — Auto-reconciliation summary</p>
          </div>
          <div className="p-6 bg-white grid grid-cols-2 md:grid-cols-5 gap-4 border-b border-indigo-100">
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900">{importResult.summary.totalRows}</p>
              <p className="text-xs text-gray-500">Deposit Rows</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">{importResult.summary.exactMatches}</p>
              <p className="text-xs text-gray-500">Auto-Matched</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-600">{importResult.summary.suggestedMatches}</p>
              <p className="text-xs text-gray-500">Suggested</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-amber-600">{importResult.summary.unclaimedCreated}</p>
              <p className="text-xs text-gray-500">→ Unclaimed Pool</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-400">{importResult.summary.skipped}</p>
              <p className="text-xs text-gray-500">Skipped (dupes)</p>
            </div>
          </div>

          {importResult.exactMatches.length > 0 && (
            <div className="p-6 bg-white border-b border-indigo-100">
              <h3 className="font-semibold text-green-800 mb-3">
                Rule A — Exact Reference Matches (Bank Cleared)
              </h3>
              <div className="space-y-2">
                {importResult.exactMatches.map((m) => (
                  <div key={m.paymentId} className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg text-sm">
                    <span className="text-green-600 font-bold">✓</span>
                    <span className="font-medium">{m.invoiceNumber}</span>
                    <span className="text-gray-500">{m.customerName}</span>
                    <span className="font-medium">{formatCurrency(m.amount)}</span>
                    <span className="text-gray-400 truncate flex-1">{m.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {importResult.suggestedMatches.length > 0 && (
            <div className="p-6 bg-white border-b border-indigo-100">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-blue-800">
                  Rule B — Suggested Matches (confirm to mark Bank Cleared)
                </h3>
                {isAccountant && (
                  <button
                    onClick={handleConfirmSuggested}
                    disabled={selectedSuggested.size === 0 || confirming}
                    className="px-4 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {confirming
                      ? 'Confirming...'
                      : `Confirm Selected (${selectedSuggested.size})`}
                  </button>
                )}
              </div>
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs text-gray-500 uppercase">
                    <th className="pb-2 w-8"></th>
                    <th className="pb-2">Bank Row</th>
                    <th className="pb-2">Invoice</th>
                    <th className="pb-2">Amount</th>
                    <th className="pb-2">Date Diff</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-blue-50">
                  {importResult.suggestedMatches.map((m) => (
                    <tr key={m.paymentId} className="text-sm">
                      <td className="py-3">
                        {isAccountant && (
                          <input
                            type="checkbox"
                            checked={selectedSuggested.has(m.paymentId)}
                            onChange={() => toggleSuggested(m.paymentId)}
                            className="rounded border-gray-300"
                          />
                        )}
                      </td>
                      <td className="py-3">
                        <p className="text-gray-600 truncate max-w-xs">{m.description}</p>
                        <p className="text-xs text-gray-400">{formatDate(m.date)}</p>
                      </td>
                      <td className="py-3">
                        <span className="font-medium">{m.invoiceNumber}</span>
                        <span className="text-gray-500 ml-1">{m.customerName}</span>
                      </td>
                      <td className="py-3 font-medium">{formatCurrency(m.amount)}</td>
                      <td className="py-3 text-gray-500">
                        ±{m.daysDiff} day{m.daysDiff !== 1 ? 's' : ''}
                        <span className="text-xs block">Payment: {formatDate(m.paymentDate)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {importResult.unclaimedCreated.length > 0 && (
            <div className="p-6 bg-white">
              <h3 className="font-semibold text-amber-800 mb-3">
                Unmatched Rows → Auto-added to Unclaimed Pool
              </h3>
              <div className="space-y-2">
                {importResult.unclaimedCreated.map((u) => (
                  <div key={u.depositId} className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
                    <span className="text-amber-600 font-bold">+</span>
                    <span className="font-medium">{formatCurrency(u.amount)}</span>
                    <span className="text-gray-500">{formatDate(u.date)}</span>
                    <span className="text-gray-400 truncate flex-1">{u.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="px-6 py-3 bg-indigo-50 text-right">
            <button
              onClick={() => setImportResult(null)}
              className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatCard
          title="Unclaimed Pool"
          value={formatCurrency(data.unclaimedTotal)}
          subtitle={`${data.unclaimedDeposits.length} deposit${data.unclaimedDeposits.length !== 1 ? 's' : ''} awaiting match`}
          icon="🏦"
          color="bg-amber-50 text-amber-600"
        />
        <StatCard
          title="Pending Verification"
          value={formatCurrency(data.pendingTotal)}
          subtitle={`${data.pendingVerificationCount} receipt${data.pendingVerificationCount !== 1 ? 's' : ''} to verify`}
          icon="⏳"
          color="bg-yellow-50 text-yellow-600"
        />
        <StatCard
          title="Bank Cleared"
          value={formatCurrency(data.bankClearedTotal)}
          subtitle="Recently verified"
          icon="✅"
          color="bg-green-50 text-green-600"
        />
      </div>

      {/* Unclaimed Deposits Pool */}
      <div className="mb-8 bg-amber-50 border-2 border-amber-300 rounded-xl overflow-hidden">
        <div className="px-6 py-4 bg-amber-100 border-b border-amber-300 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-amber-900 text-lg">
              Unclaimed Bank Deposits
            </h2>
            <p className="text-sm text-amber-700">待認領入帳 — Money in the bank, not yet matched to an order</p>
          </div>
          {isAccountant && (
            <button
              onClick={() => setShowLogModal(true)}
              className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors"
            >
              + Log Unclaimed Deposit
            </button>
          )}
        </div>

        {data.unclaimedDeposits.length === 0 ? (
          <div className="p-8 text-center text-amber-700 text-sm">
            No unclaimed deposits in the pool. {isAccountant ? 'Log one when you spot unidentified funds on the bank statement.' : 'The accountant will log deposits here when found on bank statements.'}
          </div>
        ) : (
          <table className="w-full bg-white">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-amber-200">
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">Amount</th>
                <th className="px-6 py-3">Bank</th>
                <th className="px-6 py-3">Reference / Remarks</th>
                <th className="px-6 py-3">Logged By</th>
                <th className="px-6 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-amber-100">
              {data.unclaimedDeposits.map((dep) => (
                <tr key={dep.id} className="hover:bg-amber-50/50">
                  <td className="px-6 py-4 text-sm">{formatDate(dep.deposit_date)}</td>
                  <td className="px-6 py-4 text-sm font-bold text-amber-900">{formatCurrency(dep.amount)}</td>
                  <td className="px-6 py-4 text-sm">{dep.bank}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{dep.remarks || '—'}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{dep.created_by_name}</td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => openClaimModal(dep.id)}
                      className="px-3 py-1.5 bg-brand-600 text-white text-xs font-medium rounded-lg hover:bg-brand-700"
                    >
                      Claim &amp; Link Order
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pending Verification */}
      <div className="mb-8 bg-white rounded-xl border border-yellow-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-yellow-200 bg-yellow-50">
          <h2 className="font-semibold text-yellow-900">Pending Verification</h2>
          <p className="text-sm text-yellow-700">Receipts uploaded by sales — awaiting accountant bank confirmation</p>
        </div>
        {data.pendingPayments.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">No payments pending verification.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wider">
                <th className="px-6 py-3">Invoice</th>
                <th className="px-6 py-3">Customer</th>
                <th className="px-6 py-3">Amount</th>
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">Uploaded By</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.pendingPayments.map((pay) => (
                <tr key={pay.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <Link href={`/invoices/${pay.invoice_id}`} className="text-brand-600 hover:text-brand-700 font-medium text-sm">
                      {pay.invoice_number}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-sm">{pay.customer_name}</td>
                  <td className="px-6 py-4 text-sm font-medium">{formatCurrency(pay.amount)}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{formatDate(pay.payment_date)}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{pay.created_by_name}</td>
                  <td className="px-6 py-4"><PaymentStatusBadge status={pay.status} /></td>
                  <td className="px-6 py-4">
                    {isAccountant ? (
                      <button
                        onClick={() => handleVerify(pay.id)}
                        disabled={verifyingId === pay.id}
                        className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
                      >
                        {verifyingId === pay.id ? 'Verifying...' : 'Verify (Bank Cleared)'}
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400">Awaiting accountant</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Bank Cleared */}
      <div className="bg-white rounded-xl border border-green-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-green-200 bg-green-50">
          <h2 className="font-semibold text-green-900">Bank Cleared Payments</h2>
          <p className="text-sm text-green-700">Verified and locked — money confirmed in the bank</p>
        </div>
        {data.bankClearedPayments.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">No bank-cleared payments yet.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wider">
                <th className="px-6 py-3">Invoice</th>
                <th className="px-6 py-3">Customer</th>
                <th className="px-6 py-3">Amount</th>
                <th className="px-6 py-3">Verified By</th>
                <th className="px-6 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.bankClearedPayments.map((pay) => (
                <tr key={pay.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <Link href={`/invoices/${pay.invoice_id}`} className="text-brand-600 hover:text-brand-700 font-medium text-sm">
                      {pay.invoice_number}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-sm">{pay.customer_name}</td>
                  <td className="px-6 py-4 text-sm font-medium">{formatCurrency(pay.amount)}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{pay.verified_by_name || '—'}</td>
                  <td className="px-6 py-4"><PaymentStatusBadge status={pay.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Log Unclaimed Deposit Modal */}
      {showLogModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-1">Log Unclaimed Deposit</h3>
            <p className="text-sm text-gray-500 mb-4">Record money found on the bank statement without a matched order.</p>
            <form onSubmit={handleLogDeposit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input
                  type="date"
                  value={depositForm.deposit_date}
                  onChange={(e) => setDepositForm({ ...depositForm, deposit_date: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={depositForm.amount}
                  onChange={(e) => setDepositForm({ ...depositForm, amount: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bank</label>
                <input
                  type="text"
                  value={depositForm.bank}
                  onChange={(e) => setDepositForm({ ...depositForm, bank: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="e.g. HSBC Business Account"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Remarks / Reference Code</label>
                <textarea
                  value={depositForm.remarks}
                  onChange={(e) => setDepositForm({ ...depositForm, remarks: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="Bank statement reference code or notes"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2 bg-amber-600 text-white font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Log Deposit'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowLogModal(false)}
                  className="flex-1 py-2 border border-gray-300 font-medium rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Claim & Link Modal */}
      {claimingId !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-1">Claim &amp; Link Order</h3>
            <p className="text-sm text-gray-500 mb-4">
              認領與平數 — Match this deposit to an unpaid or pending invoice.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Select Invoice</label>
              <select
                value={selectedInvoiceId}
                onChange={(e) => setSelectedInvoiceId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="">Choose an unpaid / pending order...</option>
                {linkableInvoices.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.invoice_number} — {inv.customer_name} ({formatCurrency(inv.total)})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleClaim}
                disabled={!selectedInvoiceId || saving}
                className="flex-1 py-2 bg-brand-600 text-white font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50"
              >
                {saving ? 'Linking...' : 'Link & Mark Bank Cleared'}
              </button>
              <button
                onClick={() => setClaimingId(null)}
                className="flex-1 py-2 border border-gray-300 font-medium rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
