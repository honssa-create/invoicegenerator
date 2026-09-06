'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatMoney } from '@/lib/cashflow';
import { displayInvoiceNumber } from '@/lib/record-numbering-core';
import {
  RECONCILIATION_SELECT_CLS,
  type MatchCandidate,
} from '@/lib/reconciliation-page-utils';

interface Props {
  linkRecordId: number | null;
  candidates: MatchCandidate[];
  onSearch: (query: string) => void;
  onClose: () => void;
  onSubmit: (invoiceId: string) => Promise<boolean>;
  linking: boolean;
}

export default function ReconciliationLinkModal({
  linkRecordId,
  candidates,
  onSearch,
  onClose,
  onSubmit,
  linking,
}: Props) {
  const [candidateSearch, setCandidateSearch] = useState('');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');

  useEffect(() => {
    if (linkRecordId == null) return;
    setCandidateSearch('');
    setSelectedInvoiceId('');
    onSearch('');
  }, [linkRecordId, onSearch]);

  const filteredCandidates = useMemo(() => {
    const q = candidateSearch.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) =>
      [c.order_no, c.invoice_number, c.customer_name, c.phone]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [candidateSearch, candidates]);

  if (linkRecordId == null) return null;

  return (
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Manual Link 手動連結訂單</h2>
        <p className="text-sm text-gray-500 mb-4">
          Link record #{linkRecordId} to an unpaid invoice (approves immediately).
        </p>
        <label className="text-xs font-medium text-gray-500">Search name / phone / order / invoice</label>
        <input
          value={candidateSearch}
          onChange={(e) => {
            setCandidateSearch(e.target.value);
            onSearch(e.target.value);
          }}
          placeholder="e.g. 張先生 / 9123 / NES-…"
          className={`${RECONCILIATION_SELECT_CLS} mt-1 mb-3`}
        />
        <label className="text-xs font-medium text-gray-500">Invoice</label>
        <select
          value={selectedInvoiceId}
          onChange={(e) => setSelectedInvoiceId(e.target.value)}
          className={`${RECONCILIATION_SELECT_CLS} mt-1 mb-4`}
        >
          <option value="">Select invoice…</option>
          {filteredCandidates.map((c) => (
            <option key={c.invoice_id!} value={c.invoice_id!}>
              {displayInvoiceNumber(c.invoice_number)}
              {c.order_no ? ` · ${c.order_no}` : ''}
              {c.invoice_total != null ? ` · ${formatMoney(c.invoice_total)}` : ''}
              {c.customer_name ? ` · ${c.customer_name}` : ''}
              {c.phone ? ` · ${c.phone}` : ''}
            </option>
          ))}
        </select>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => void onSubmit(selectedInvoiceId)}
            disabled={!selectedInvoiceId || linking}
            className="px-4 py-2 text-sm rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {linking ? 'Saving…' : 'Manual Link & Approve'}
          </button>
        </div>
      </div>
    </div>
  );
}
